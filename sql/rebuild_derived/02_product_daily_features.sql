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
