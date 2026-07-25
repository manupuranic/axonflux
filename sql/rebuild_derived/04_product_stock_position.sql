CREATE TABLE IF NOT EXISTS derived.product_stock_position (
    date            DATE NOT NULL,
    product_id      TEXT NOT NULL,

    total_purchased NUMERIC,
    total_sold      NUMERIC,
    total_bom_consumed NUMERIC,

    pseudo_stock    NUMERIC,

    last_sale_date  DATE,
    last_purchase_date DATE,

    created_at      TIMESTAMP DEFAULT NOW(),

    PRIMARY KEY (date, product_id)
);

-- backfill column for tables created before BOM consumption tracking was added
ALTER TABLE derived.product_stock_position
    ADD COLUMN IF NOT EXISTS total_bom_consumed NUMERIC;

-- populate product_stock_position table
TRUNCATE TABLE derived.product_stock_position;

INSERT INTO derived.product_stock_position (
    date,
    product_id,
    total_purchased,
    total_sold,
    total_bom_consumed,
    pseudo_stock,
    last_sale_date,
    last_purchase_date
)

WITH

-- Daily BOM consumption per raw material barcode:
-- For each day, sum up (finished_good_qty_sold × qty_per_unit) across all
-- finished goods that map to this raw material.
bom_daily AS (
    SELECT
        pdm.date,
        b.raw_barcode                              AS product_id,
        SUM(COALESCE(pdm.quantity_sold, 0) * b.qty_per_unit) AS bom_consumed
    FROM derived.product_daily_metrics pdm
    JOIN app.product_bom b ON b.finished_barcode = pdm.product_id
    GROUP BY pdm.date, b.raw_barcode
),

-- Barcodes that are finished goods (exclude from stock position entirely)
excluded_finished AS (
    SELECT DISTINCT finished_barcode AS product_id
    FROM app.product_bom
),

-- Base time series — exclude finished goods
base AS (
    SELECT *
    FROM derived.product_daily_metrics
    WHERE product_id NOT IN (SELECT product_id FROM excluded_finished)
)

SELECT
    base.date,
    base.product_id,

    -- cumulative purchases
    SUM(COALESCE(base.purchase_quantity, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS total_purchased,

    -- cumulative direct sales
    SUM(COALESCE(base.quantity_sold, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS total_sold,

    -- cumulative BOM consumption (raw material drained by finished-good sales)
    SUM(COALESCE(bd.bom_consumed, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS total_bom_consumed,

    -- pseudo stock = purchased - direct sold - bom consumed
    SUM(COALESCE(base.purchase_quantity, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
    -
    SUM(COALESCE(base.quantity_sold, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
    -
    SUM(COALESCE(bd.bom_consumed, 0)) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS pseudo_stock,

    -- last sale signal
    MAX(
        CASE WHEN base.quantity_sold > 0 THEN base.date END
    ) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS last_sale_date,

    -- last purchase signal
    MAX(
        CASE WHEN base.purchase_quantity > 0 THEN base.date END
    ) OVER (
        PARTITION BY base.product_id
        ORDER BY base.date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS last_purchase_date

FROM base
LEFT JOIN bom_daily bd
    ON bd.product_id = base.product_id
    AND bd.date = base.date;

-- create index for product_stock_position table
CREATE INDEX IF NOT EXISTS idx_stock_product_date
ON derived.product_stock_position (product_id, date);
