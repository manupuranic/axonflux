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

    STDDEV(m.quantity_sold) OVER (
        PARTITION BY m.product_id
        ORDER BY m.date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS last_7_day_stddev,

    EXTRACT(DOW FROM m.date) AS day_of_week

FROM derived.product_daily_metrics m;