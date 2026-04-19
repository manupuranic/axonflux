CREATE TABLE IF NOT EXISTS derived.product_daily_metrics (
    date DATE NOT NULL,
    product_id TEXT NOT NULL,

    quantity_sold NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    avg_price NUMERIC,
    purchase_quantity NUMERIC NOT NULL DEFAULT 0,

    PRIMARY KEY (date, product_id)
);

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
itemwise_norm AS (
    -- Normalize raw datetime: ensure space at position 11, then branch 12h vs 24h.
    -- Handles: "04-04-202507:29 AM" | "04-04-2025 07:29 AM" | "04-04-2025 18:30"
    SELECT
        barcode,
        sale_qty,
        free_qty,
        net_total,
        CASE WHEN SUBSTRING(sale_datetime_raw, 11, 1) = ' '
             THEN sale_datetime_raw
             ELSE SUBSTRING(sale_datetime_raw, 1, 10) || ' ' || SUBSTRING(sale_datetime_raw, 11)
        END AS dt
    FROM raw.raw_sales_itemwise
    WHERE sale_datetime_raw IS NOT NULL
      AND sale_datetime_raw ~ '^\d{2}-\d{2}-\d{4}'
),
sales_agg AS (
    SELECT
        CASE WHEN dt ~* '(AM|PM)\s*$'
             THEN TO_TIMESTAMP(dt, 'DD-MM-YYYY HH12:MI AM')
             ELSE TO_TIMESTAMP(dt, 'DD-MM-YYYY HH24:MI')
        END::DATE AS date,
        barcode AS product_id,
        SUM(COALESCE(sale_qty,0) + COALESCE(free_qty,0)) AS quantity_sold,
        SUM(COALESCE(net_total,0)) AS revenue
    FROM itemwise_norm
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
