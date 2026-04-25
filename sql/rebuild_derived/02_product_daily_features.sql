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

    -- demand suppression proxy: sold nothing today despite recent activity + no restock
    -- training code should exclude these rows from target (censored, not true zero demand)
    stockout_proxy BOOLEAN NOT NULL DEFAULT FALSE,

    -- calendar features (NULL if derived.calendar_dim not yet seeded)
    is_holiday BOOLEAN,
    days_to_next_festival INTEGER,
    days_since_last_festival INTEGER,

    PRIMARY KEY (date, product_id)
);

-- Add columns introduced after initial table creation (idempotent)
ALTER TABLE derived.product_daily_features
    ADD COLUMN IF NOT EXISTS stockout_proxy          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_holiday              BOOLEAN,
    ADD COLUMN IF NOT EXISTS days_to_next_festival   INTEGER,
    ADD COLUMN IF NOT EXISTS days_since_last_festival INTEGER;

TRUNCATE TABLE derived.product_daily_features;

-- CTE required: window function aliases can't be referenced in CASE in same SELECT scope
WITH windowed AS (
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

    FROM derived.product_daily_metrics m
)
INSERT INTO derived.product_daily_features
SELECT
    w.date,
    w.product_id,
    w.quantity_sold,
    w.revenue,
    w.purchase_quantity,
    w.lag_1_qty,
    w.lag_7_qty,
    w.last_7_day_avg,
    w.last_30_day_avg,
    w.last_60_day_avg,
    w.last_7_day_stddev,
    w.day_of_week,

    -- stockout proxy: product was active, zero sold today, no restock
    CASE
        WHEN w.quantity_sold = 0
         AND COALESCE(w.last_7_day_avg, 0) > 0.5
         AND w.purchase_quantity = 0
        THEN TRUE
        ELSE FALSE
    END AS stockout_proxy,

    c.is_holiday,
    c.days_to_next_festival,
    c.days_since_last_festival

FROM windowed w
LEFT JOIN derived.calendar_dim c ON w.date = c.date;
