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
