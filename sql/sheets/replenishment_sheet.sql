CREATE OR REPLACE VIEW derived.replenishment_sheet AS
SELECT
    h.product_id AS barcode,

    pd.product_name,

    sm.supplier_name,

    ic.current_stock AS system_stock,

    ROUND(h.predicted_daily_demand,2) AS predicted_daily_demand,

    ROUND(
        h.predicted_daily_demand *
        CASE
            WHEN sl.supplier_region = 'BELLARY' THEN 7
            ELSE 15
        END
    ) AS min_stock,

    ROUND(
        h.predicted_daily_demand *
        CASE
            WHEN sl.supplier_region = 'BELLARY' THEN 15
            ELSE 30
        END
    ) AS max_stock

FROM derived.product_health_signals h

LEFT JOIN derived.product_dimension pd
ON h.product_id = pd.product_id

LEFT JOIN derived.product_supplier_mapping sm
ON h.product_id = sm.product_id

LEFT JOIN derived.supplier_location sl
ON sm.supplier_name = sl.supplier_name

LEFT JOIN derived.latest_item_combinations ic
ON h.product_id = ic.product_id

WHERE h.date = (
    SELECT MAX(date)
    FROM derived.product_health_signals
);