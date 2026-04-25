-- latest_item_combinations:
DROP VIEW IF EXISTS derived.latest_item_combinations CASCADE;
CREATE VIEW derived.latest_item_combinations AS
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    purchase_price,
    rate,
    mrp,
    expiry_date_raw,
    hsn_code,
  	system_stock_snapshot as current_stock
FROM raw.raw_item_combinations
ORDER BY barcode, imported_at DESC;

-- supplier location: latest batch only, one row per supplier name
DROP VIEW IF EXISTS derived.supplier_location CASCADE;
CREATE VIEW derived.supplier_location AS
SELECT DISTINCT ON (supplier_name_raw)
    supplier_name_raw AS supplier_name,
    CASE
        WHEN city_raw = 'Bellary' THEN 'BELLARY'
        ELSE 'OUTSIDE'
    END AS supplier_region
FROM raw.raw_supplier_master
ORDER BY supplier_name_raw, imported_at DESC;

-- product_supplier_mapping:
DROP VIEW IF EXISTS derived.product_supplier_mapping CASCADE;
CREATE VIEW derived.product_supplier_mapping AS
SELECT DISTINCT
    barcode AS product_id,
    supplier_name_raw AS supplier_name
FROM raw.raw_purchase_itemwise;

-- product_dimension_view: Recency-aware product identity with app.products overrides
-- Alias-aware: barcodes in app.product_aliases are remapped to their canonical_barcode
-- before DISTINCT ON, so alias barcodes never appear as independent product rows.
DROP VIEW IF EXISTS derived.product_dimension CASCADE;
CREATE VIEW derived.product_dimension AS
WITH alias_map AS (
    -- Confirmed barcode aliases: alias_barcode → canonical_barcode
    SELECT alias_barcode, canonical_barcode FROM app.product_aliases
),
item_master_names AS (
    -- Most recent name from item master, alias barcodes remapped to canonical
    SELECT DISTINCT ON (COALESCE(al.canonical_barcode, ric.barcode))
        COALESCE(al.canonical_barcode, ric.barcode) AS barcode,
        ric.item_name_raw,
        ric.imported_at
    FROM raw.raw_item_combinations ric
    LEFT JOIN alias_map al ON ric.barcode = al.alias_barcode
    WHERE ric.item_name_raw IS NOT NULL AND ric.item_name_raw != ''
    ORDER BY COALESCE(al.canonical_barcode, ric.barcode), ric.imported_at DESC
),
sales_names AS (
    -- Most recent name from sales, alias barcodes remapped to canonical
    SELECT DISTINCT ON (COALESCE(al.canonical_barcode, rsi.barcode))
        COALESCE(al.canonical_barcode, rsi.barcode) AS barcode,
        rsi.item_name_raw,
        rsi.imported_at
    FROM raw.raw_sales_itemwise rsi
    LEFT JOIN alias_map al ON rsi.barcode = al.alias_barcode
    WHERE rsi.item_name_raw IS NOT NULL AND rsi.item_name_raw != ''
    ORDER BY COALESCE(al.canonical_barcode, rsi.barcode), rsi.imported_at DESC
),
all_barcodes AS (
    -- Union of canonical barcodes only (alias barcodes already folded in above)
    SELECT DISTINCT barcode FROM sales_names
    UNION
    SELECT DISTINCT barcode FROM item_master_names
),
product_names AS (
    -- Recency-aware fallback chain: app.products override → item master → sales
    SELECT
        ab.barcode,
        COALESCE(
            ap.canonical_name,
            im.item_name_raw,
            sn.item_name_raw,
            ab.barcode
        ) AS product_name,
        ap.brand,
        ap.hsn_code,
        ap.category,
        ap.product_type,
        ap.is_reviewed,
        COALESCE(ap.barcode, ab.barcode) IS NOT NULL AS has_app_product
    FROM all_barcodes ab
    LEFT JOIN app.products ap ON ab.barcode = ap.barcode
    LEFT JOIN item_master_names im ON ab.barcode = im.barcode
    LEFT JOIN sales_names sn ON ab.barcode = sn.barcode
)
SELECT
    barcode AS product_id,
    product_name,
    brand,
    hsn_code,
    category,
    product_type,
    is_reviewed
FROM product_names;