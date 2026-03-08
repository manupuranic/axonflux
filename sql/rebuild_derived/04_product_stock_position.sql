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
