CREATE OR REPLACE VIEW derived.conversion_attention_sheet AS
SELECT
    h.product_id AS barcode,

    pd.product_name,

    ic.current_stock,

    h.predicted_daily_demand,

    ROUND(GREATEST(h.predicted_daily_demand * 7, 5)) AS min_stock,

    ROUND(GREATEST(h.predicted_daily_demand * 15, 5)) AS max_stock

FROM derived.product_health_signals h

LEFT JOIN derived.product_dimension pd
ON h.product_id = pd.product_id

LEFT JOIN derived.latest_item_combinations ic
ON h.product_id = ic.product_id

LEFT JOIN derived.product_supplier_mapping sm
ON h.product_id = sm.product_id

WHERE sm.supplier_name IS NULL
AND h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
)
AND h.predicted_daily_demand > 0;