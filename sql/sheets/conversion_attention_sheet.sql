CREATE OR REPLACE VIEW derived.conversion_attention_sheet AS
SELECT
    h.product_id AS barcode,

    pd.product_name,

    ic.current_stock,

    ROUND(h.predicted_daily_demand, 2) AS predicted_daily_demand,

    ROUND(GREATEST(h.predicted_daily_demand * 7, 5)) AS min_stock,

    ROUND(GREATEST(h.predicted_daily_demand * 15, 5)) AS max_stock

FROM derived.product_health_signals h

LEFT JOIN derived.product_dimension pd
ON h.product_id = pd.product_id

LEFT JOIN derived.latest_item_combinations ic
ON h.product_id = ic.product_id

WHERE NOT EXISTS (
    SELECT 1
    FROM derived.product_supplier_mapping sm
    WHERE sm.product_id = h.product_id
)

AND h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
)
AND h.predicted_daily_demand > 0.02;