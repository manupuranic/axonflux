CREATE SCHEMA IF NOT EXISTS derived;

CREATE TABLE derived.daily_sales_summary (
    sale_date              date PRIMARY KEY,
    total_bills            integer,
    total_items_sold       numeric,
    total_revenue          numeric,
    avg_bill_value         numeric,
    created_at             timestamp without time zone DEFAULT now()
);

-- Aggregate to summarize daily sales performance
WITH bill_agg AS (
    SELECT
        to_timestamp(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
        COUNT(*)                                                     AS total_bills,
        SUM(net_total)                                               AS total_revenue
    FROM raw.raw_sales_billwise
    GROUP BY 1
),
item_agg AS (
    SELECT
        to_timestamp(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
        SUM(sale_qty)                                                 AS total_items_sold
    FROM raw.raw_sales_itemwise
    GROUP BY 1
)
SELECT
    COALESCE(b.sale_date, i.sale_date)                               AS sale_date,
    b.total_bills,
    i.total_items_sold,
    b.total_revenue,
    CASE
        WHEN b.total_bills > 0 THEN b.total_revenue / b.total_bills
        ELSE NULL
    END                                                              AS avg_bill_value
FROM bill_agg b
FULL OUTER JOIN item_agg i
    ON b.sale_date = i.sale_date;

-- Daily refresh:
TRUNCATE TABLE derived.daily_sales_summary;

INSERT INTO derived.daily_sales_summary (
    sale_date,
    total_bills,
    total_items_sold,
    total_revenue,
    avg_bill_value
)
SELECT * FROM (
    WITH bill_agg AS (
    SELECT *
    FROM (
        SELECT
            to_timestamp(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
            COUNT(*)                                                     AS total_bills,
            SUM(net_total)                                               AS total_revenue
        FROM raw.raw_sales_billwise
        GROUP BY 1
    ) t
    WHERE sale_date IS NOT NULL
),
item_agg AS (
    SELECT *
    FROM (
        SELECT
            to_timestamp(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
            SUM(sale_qty)                                                 AS total_items_sold
        FROM raw.raw_sales_itemwise
        GROUP BY 1
    ) t
    WHERE sale_date IS NOT NULL
)
SELECT
    COALESCE(b.sale_date, i.sale_date) AS sale_date,
    b.total_bills,
    i.total_items_sold,
    b.total_revenue,
    CASE
        WHEN b.total_bills > 0 THEN b.total_revenue / b.total_bills
        ELSE NULL
    END AS avg_bill_value
FROM bill_agg b
FULL OUTER JOIN item_agg i
    ON b.sale_date = i.sale_date
) t;

-- Daily purchase summary table
CREATE TABLE IF NOT EXISTS derived.daily_purchase_summary (
    purchase_date           date PRIMARY KEY,
    total_purchase_bills    integer,
    total_quantity_purchased numeric,
    total_taxable_value     numeric,
    total_settled_amount    numeric,
    total_due_amount        numeric,
    created_at              timestamp without time zone DEFAULT now()
);

TRUNCATE TABLE derived.daily_purchase_summary;

INSERT INTO derived.daily_purchase_summary (
    purchase_date,
    total_purchase_bills,
    total_quantity_purchased,
    total_taxable_value,
    total_settled_amount,
    total_due_amount
)
SELECT * FROM (
    -- paste derivation query here
    WITH bill_agg AS (
    SELECT *
    FROM (
        SELECT
            to_date(purchase_date_raw, 'DD-MM-YYYY') AS purchase_date,
            COUNT(*)                                 AS total_purchase_bills,
            SUM(taxable_value)                       AS total_taxable_value,
            SUM(settled_amount)                      AS total_settled_amount,
            SUM(due_amount)                          AS total_due_amount
        FROM raw.raw_purchase_billwise
        GROUP BY 1
    ) t
    WHERE purchase_date IS NOT NULL
),
item_agg AS (
    SELECT *
    FROM (
        SELECT
            to_date(purchase_date_raw, 'DD-MM-YYYY') AS purchase_date,
            SUM(total_qty)                            AS total_quantity_purchased
        FROM raw.raw_purchase_itemwise
        GROUP BY 1
    ) t
    WHERE purchase_date IS NOT NULL
)
SELECT
    COALESCE(b.purchase_date, i.purchase_date) AS purchase_date,
    b.total_purchase_bills,
    i.total_quantity_purchased,
    b.total_taxable_value,
    b.total_settled_amount,
    b.total_due_amount
FROM bill_agg b
FULL OUTER JOIN item_agg i
  ON b.purchase_date = i.purchase_date
) t;

-- product_daily_metrics

CREATE TABLE IF NOT EXISTS derived.product_daily_metrics (
    date DATE NOT NULL,
    product_id TEXT NOT NULL,

    quantity_sold NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    avg_price NUMERIC,
    purchase_quantity NUMERIC NOT NULL DEFAULT 0,

    PRIMARY KEY (date, product_id)
);

--sparse table
TRUNCATE TABLE derived.product_daily_metrics;

WITH sales_agg AS (
    SELECT
        TO_TIMESTAMP(
            REGEXP_REPLACE(sale_datetime_raw, '(\d{2}-\d{2}-\d{4})(\d{2}:\d{2} [AP]M)', '\1 \2'),
            'DD-MM-YYYY HH12:MI AM'
        )::DATE AS date,
        barcode AS product_id,
        SUM(COALESCE(sale_qty,0) + COALESCE(free_qty,0)) AS quantity_sold,
        SUM(COALESCE(net_total,0)) AS revenue
    FROM raw.raw_sales_itemwise
    GROUP BY 1,2
),
purchase_agg AS (
    SELECT
        TO_DATE(purchase_date_raw, 'DD-MM-YYYY') AS date,
        barcode AS product_id,
        SUM(COALESCE(total_qty,0)) AS purchase_quantity
    FROM raw.raw_purchase_itemwise
    GROUP BY 1,2
)
INSERT INTO derived.product_daily_metrics (
    date,
    product_id,
    quantity_sold,
    revenue,
    avg_price,
    purchase_quantity
)
SELECT
    s.date,
    s.product_id,
    s.quantity_sold,
    s.revenue,
    CASE
        WHEN s.quantity_sold = 0 THEN NULL
        ELSE s.revenue / s.quantity_sold
    END,
    COALESCE(p.purchase_quantity,0)
FROM sales_agg s
LEFT JOIN purchase_agg p
    ON s.date = p.date
    AND s.product_id = p.product_id;

-- dense table for ML training
TRUNCATE TABLE derived.product_daily_metrics;

WITH date_spine AS (
    SELECT generate_series(
        (SELECT MIN(sale_date) FROM derived.daily_sales_summary),
        CURRENT_DATE,
        INTERVAL '1 day'
    )::DATE AS date
),
products AS (
    SELECT DISTINCT barcode AS product_id
    FROM raw.raw_sales_itemwise
),
sales_agg AS (
    SELECT
        TO_TIMESTAMP(
            REGEXP_REPLACE(sale_datetime_raw, '(\d{2}-\d{2}-\d{4})(\d{2}:\d{2} [AP]M)', '\1 \2'),
            'DD-MM-YYYY HH12:MI AM'
        )::DATE AS date,
        barcode AS product_id,
        SUM(COALESCE(sale_qty,0) + COALESCE(free_qty,0)) AS quantity_sold,
        SUM(COALESCE(net_total,0)) AS revenue
    FROM raw.raw_sales_itemwise
    GROUP BY 1,2
),
purchase_agg AS (
    SELECT
        TO_DATE(purchase_date_raw, 'DD-MM-YYYY') AS date,
        barcode AS product_id,
        SUM(COALESCE(total_qty,0)) AS purchase_quantity
    FROM raw.raw_purchase_itemwise
    GROUP BY 1,2
),
dense_grid AS (
    SELECT d.date, p.product_id
    FROM date_spine d
    CROSS JOIN products p
)
INSERT INTO derived.product_daily_metrics (
    date,
    product_id,
    quantity_sold,
    revenue,
    avg_price,
    purchase_quantity
)
SELECT
    g.date,
    g.product_id,
    COALESCE(s.quantity_sold,0),
    COALESCE(s.revenue,0),
    CASE
        WHEN COALESCE(s.quantity_sold,0) = 0 THEN NULL
        ELSE COALESCE(s.revenue,0) / s.quantity_sold
    END,
    COALESCE(p.purchase_quantity,0)
FROM dense_grid g
LEFT JOIN sales_agg s
    ON g.date = s.date
    AND g.product_id = s.product_id
LEFT JOIN purchase_agg p
    ON g.date = p.date
    AND g.product_id = p.product_id;

-- product_daily_features
CREATE TABLE IF NOT EXISTS derived.product_daily_features (
    date DATE NOT NULL,
    product_id TEXT NOT NULL,

    quantity_sold NUMERIC NOT NULL,
    revenue NUMERIC NOT NULL,
    purchase_quantity NUMERIC NOT NULL,

    lag_1_qty NUMERIC,
    lag_7_qty NUMERIC,

    last_7_day_avg NUMERIC,
    last_30_day_avg NUMERIC,
    last_60_day_avg NUMERIC,
    last_7_day_stddev NUMERIC,

    day_of_week INTEGER,

    PRIMARY KEY (date, product_id)
);

TRUNCATE TABLE derived.product_daily_features;

INSERT INTO derived.product_daily_features
SELECT
    m.date,
    m.product_id,
    m.quantity_sold,
    m.revenue,
    m.purchase_quantity,

    LAG(m.quantity_sold, 1) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
    ) AS lag_1_qty,

    LAG(m.quantity_sold, 7) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
    ) AS lag_7_qty,

    AVG(m.quantity_sold) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS last_7_day_avg,

    AVG(m.quantity_sold) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS last_30_day_avg,

    AVG(m.quantity_sold) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
        ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
    ) AS last_60_day_avg,

    STDDEV(m.quantity_sold) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS last_7_day_stddev,

    EXTRACT(DOW FROM m.date) AS day_of_week

FROM derived.product_daily_metrics m;


-- product_health_signals table
CREATE TABLE IF NOT EXISTS derived.product_health_signals (
    date                DATE NOT NULL,
    product_id          TEXT NOT NULL,

    -- demand signals
    predicted_daily_demand NUMERIC,
    last_7_day_avg      NUMERIC,
    last_30_day_avg     NUMERIC,
    last_60_day_avg     NUMERIC,
    demand_volatility   NUMERIC,

    -- health flags
    fast_moving_flag    BOOLEAN,
    slow_moving_flag    BOOLEAN,
    dead_stock_flag     BOOLEAN,
    demand_spike_flag   BOOLEAN,

    -- metadata
    created_at          TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY (date, product_id)
);

-- populate product_health_signals table
TRUNCATE TABLE derived.product_health_signals;

INSERT INTO derived.product_health_signals (
    date,
    product_id,
    predicted_daily_demand,
    last_7_day_avg,
    last_30_day_avg,
    last_60_day_avg,
    demand_volatility,
    fast_moving_flag,
    slow_moving_flag,
    dead_stock_flag,
    demand_spike_flag
)

SELECT
    date,
    product_id,

    -- baseline prediction
    ROUND(
        GREATEST(
            (
                0.6 * COALESCE(last_7_day_avg,0) +
                0.3 * COALESCE(last_30_day_avg,0) +
                0.1 * COALESCE(last_60_day_avg,0)
            ),
            0.02
        ),
        4
    ) AS predicted_daily_demand,

    last_7_day_avg,
    last_30_day_avg,
    last_60_day_avg,
    last_7_day_stddev AS demand_volatility,

    -- fast moving
    CASE
        WHEN last_7_day_avg > last_30_day_avg * 1.2
        THEN TRUE ELSE FALSE
    END AS fast_moving_flag,

    -- slow moving
    CASE
        WHEN last_30_day_avg > 0
         AND last_7_day_avg < last_30_day_avg * 0.5
        THEN TRUE ELSE FALSE
    END AS slow_moving_flag,

    -- dead stock
    CASE
        WHEN last_30_day_avg = 0
        THEN TRUE ELSE FALSE
    END AS dead_stock_flag,

    -- demand spike
    CASE
        WHEN lag_1_qty > last_7_day_avg * 2
        THEN TRUE ELSE FALSE
    END AS demand_spike_flag

FROM derived.product_daily_features;

-- create index for product_health_signals table
CREATE INDEX IF NOT EXISTS idx_health_product_date
ON derived.product_health_signals (product_id, date);

-- derived.product_stock_position
CREATE TABLE IF NOT EXISTS derived.product_stock_position (
    date            DATE NOT NULL,
    product_id      TEXT NOT NULL,

    total_purchased NUMERIC,
    total_sold      NUMERIC,

    pseudo_stock    NUMERIC,

    last_sale_date  DATE,
    last_purchase_date DATE,

    created_at      TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY (date, product_id)
);

-- populate product_stock_position table
TRUNCATE TABLE derived.product_stock_position;

INSERT INTO derived.product_stock_position (
    date,
    product_id,
    total_purchased,
    total_sold,
    pseudo_stock,
    last_sale_date,
    last_purchase_date
)

SELECT
    date,
    product_id,

    -- cumulative purchases
    SUM(COALESCE(purchase_quantity,0)) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS total_purchased,

    -- cumulative sales
    SUM(COALESCE(quantity_sold,0)) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS total_sold,

    -- pseudo stock estimate
    SUM(COALESCE(purchase_quantity,0)) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
    -
    SUM(COALESCE(quantity_sold,0)) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS pseudo_stock,

    -- last sale signal
    MAX(
        CASE WHEN quantity_sold > 0 THEN date END
    ) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS last_sale_date,

    -- last purchase signal
    MAX(
        CASE WHEN purchase_quantity > 0 THEN date END
    ) OVER (
        PARTITION BY product_id
        ORDER BY date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS last_purchase_date

FROM derived.product_daily_metrics;

-- create index for product_stock_position table
CREATE INDEX IF NOT EXISTS idx_stock_product_date
ON derived.product_stock_position (product_id, date);

-- Current Stock Snapshot
SELECT *
FROM derived.product_stock_position
WHERE date = (
    SELECT MAX(date)
    FROM derived.product_stock_position
);

-- Dead Stock Detector (Improved)
SELECT product_id, pseudo_stock
FROM derived.product_stock_position
WHERE date = (
    SELECT MAX(date)
    FROM derived.product_stock_position
)
AND pseudo_stock > 0
ORDER BY pseudo_stock DESC;

-- Few derived views for further restock recommendations

-- latest_item_combinations: 
CREATE OR REPLACE VIEW derived.latest_item_combinations AS
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    purchase_price,
    rate,
    mrp,
    expiry_date_raw,
    hsn_code,
  	system_stock_snapshot as current_stock
FROM raw.raw_item_combinations
ORDER BY barcode, imported_at DESC;

-- supplier location:
CREATE OR REPLACE VIEW derived.supplier_location AS
SELECT
    supplier_name_raw AS supplier_name,
    CASE
        WHEN city_raw = 'Bellary' THEN 'BELLARY'
        ELSE 'OUTSIDE'
    END AS supplier_region
FROM raw.raw_supplier_master;

-- product_supplier_mapping: 
CREATE OR REPLACE VIEW derived.product_supplier_mapping AS
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    supplier_name_raw AS supplier_name,
    min_stock
FROM raw.raw_purchase_itemwise
ORDER BY barcode, purchase_date_raw DESC;

-- product_dimension_view: 
CREATE OR REPLACE VIEW derived.product_dimension AS
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    item_name_raw AS product_name
FROM raw.raw_sales_itemwise
ORDER BY barcode;

-- supplier_restock_recommendations
CREATE TABLE IF NOT EXISTS derived.supplier_restock_recommendations (
    date DATE NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT,
    supplier_name TEXT,

    current_stock NUMERIC,
    predicted_daily_demand NUMERIC,

    days_of_cover NUMERIC,

    min_stock NUMERIC,
    max_stock NUMERIC,

    required_quantity NUMERIC,

    lead_time_days INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY (date, product_id)
);

-- populate supplier_restock_recommendations table
TRUNCATE TABLE derived.supplier_restock_recommendations;

INSERT INTO derived.supplier_restock_recommendations (
    date,
    product_id,
    product_name,
    supplier_name,
    current_stock,
    predicted_daily_demand,
    days_of_cover,
    min_stock,
    max_stock,
    required_quantity,
    lead_time_days
)

select DISTINCT ON (h.date, h.product_id)
    h.date,
    h.product_id,
    pd.product_name,
    sm.supplier_name,

    s.pseudo_stock AS current_stock,

    h.predicted_daily_demand,

    CASE
        WHEN h.predicted_daily_demand = 0 THEN NULL
        ELSE s.pseudo_stock / h.predicted_daily_demand
    END AS days_of_cover,

    COALESCE(
        sm.min_stock,
        CASE
            WHEN sm.supplier_name IS NULL
            THEN 2 * h.predicted_daily_demand
            ELSE 7 * h.predicted_daily_demand
        END
    ) AS min_stock,

    30 * h.predicted_daily_demand AS max_stock,

    GREATEST(
        (30 * h.predicted_daily_demand) - s.pseudo_stock,
        0
    ) AS required_quantity,

    CASE
        WHEN sl.supplier_region = 'BELLARY' THEN 7
        ELSE 15
    END AS lead_time_days

FROM derived.product_health_signals h

JOIN derived.product_stock_position s
    ON h.product_id = s.product_id
    AND h.date = s.date

LEFT JOIN derived.product_supplier_mapping sm
    ON h.product_id = sm.product_id

LEFT JOIN derived.supplier_location sl
    ON sm.supplier_name = sl.supplier_name

LEFT JOIN derived.product_dimension pd
    ON h.product_id = pd.product_id

LEFT JOIN derived.latest_item_combinations ic
    ON h.product_id = ic.product_id

WHERE h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
);

-- supplier_purchase_sheet
CREATE OR REPLACE VIEW derived.supplier_purchase_sheet AS
SELECT
r.product_id AS barcode,

pd.product_name,

r.supplier_name,

ic.current_stock AS system_stock,

s.pseudo_stock,

GREATEST(ic.current_stock, s.pseudo_stock, 0) AS effective_stock,

r.predicted_daily_demand,

CASE
WHEN sl.supplier_region = 'BELLARY' THEN 7
ELSE 15
END AS lead_time_days,

(GREATEST(ic.current_stock, s.pseudo_stock, 0)
/ NULLIF(r.predicted_daily_demand,0)) AS days_of_cover,

(
r.predicted_daily_demand *
(
CASE
WHEN sl.supplier_region = 'BELLARY' THEN 7
ELSE 15
END + 7
)
) AS target_stock,

GREATEST(
(
r.predicted_daily_demand *
(
CASE
WHEN sl.supplier_region = 'BELLARY' THEN 7
ELSE 15
END + 7
)
)
+ (r.predicted_daily_demand * 3)
- GREATEST(ic.current_stock, s.pseudo_stock, 0),
0
) AS required_quantity,

(
CASE
WHEN sl.supplier_region = 'BELLARY' THEN 7
ELSE 15
END
-
(GREATEST(ic.current_stock, s.pseudo_stock, 0)
/ NULLIF(r.predicted_daily_demand,0))
) AS urgency_score

FROM derived.supplier_restock_recommendations r

LEFT JOIN derived.product_dimension pd
ON r.product_id = pd.product_id

LEFT JOIN derived.latest_item_combinations ic
ON r.product_id = ic.product_id

LEFT JOIN derived.product_stock_position s
ON r.product_id = s.product_id
AND s.date = (
SELECT MAX(date)
FROM derived.product_stock_position
)

LEFT JOIN derived.product_supplier_mapping sm
ON r.product_id = sm.product_id

LEFT JOIN derived.supplier_location sl
ON sm.supplier_name = sl.supplier_name;

-- replenishment_sheet
CREATE OR REPLACE VIEW derived.replenishment_sheet AS
SELECT
    h.product_id AS barcode,

    pd.product_name,

    sm.supplier_name,

    ic.current_stock AS system_stock,

    ROUND(h.predicted_daily_demand,2) AS predicted_daily_demand,


        ROUND(
            h.predicted_daily_demand *
            CASE
                WHEN sl.supplier_region = 'BELLARY' THEN 7
                ELSE 15
            END
        )
     AS min_stock,

        ROUND(
            h.predicted_daily_demand *
            CASE
                WHEN sl.supplier_region = 'BELLARY' THEN 15
                ELSE 30
            END
        )
	 AS max_stock

FROM derived.product_health_signals h

LEFT JOIN derived.product_dimension pd
ON h.product_id = pd.product_id

LEFT JOIN derived.product_supplier_mapping sm
ON h.product_id = sm.product_id

LEFT JOIN derived.supplier_location sl
ON sm.supplier_name = sl.supplier_name

LEFT JOIN derived.latest_item_combinations ic
ON h.product_id = ic.product_id

WHERE h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
);

-- conversion_attention_sheet view
CREATE OR REPLACE VIEW derived.conversion_attention_sheet AS
SELECT
    h.product_id AS barcode,

    pd.product_name,

    ic.current_stock,

    h.predicted_daily_demand,

    ROUND(GREATEST(h.predicted_daily_demand * 7, 5)) AS min_stock,

    ROUND(GREATEST(h.predicted_daily_demand * 15, 5)) AS max_stock

FROM derived.product_health_signals h

LEFT JOIN derived.product_dimension pd
ON h.product_id = pd.product_id

LEFT JOIN derived.latest_item_combinations ic
ON h.product_id = ic.product_id

LEFT JOIN derived.product_supplier_mapping sm
ON h.product_id = sm.product_id

WHERE sm.supplier_name IS NULL
AND h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
)
AND h.predicted_daily_demand > 0.02;