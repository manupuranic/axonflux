CREATE TABLE IF NOT EXISTS derived.product_health_signals (
    date                DATE NOT NULL,
    product_id          TEXT NOT NULL,

    -- demand signals
    predicted_daily_demand NUMERIC,
    last_7_day_avg      NUMERIC,
    last_30_day_avg     NUMERIC,
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
    last_7_day_avg AS predicted_daily_demand,

    last_7_day_avg,
    last_30_day_avg,
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
