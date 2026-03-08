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

-- create index for supplier_restock_recommendations table
CREATE INDEX IF NOT EXISTS idx_restock_product_date
ON derived.supplier_restock_recommendations (product_id, date);
