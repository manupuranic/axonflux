-- latest_item_combinations: 
CREATE OR REPLACE VIEW derived.latest_item_combinations AS
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

-- supplier location:
CREATE OR REPLACE VIEW derived.supplier_location AS
SELECT
    supplier_name_raw AS supplier_name,
    CASE
        WHEN city_raw = 'Bellary' THEN 'BELLARY'
        ELSE 'OUTSIDE'
    END AS supplier_region
FROM raw.raw_supplier_master;

-- product_supplier_mapping: 
CREATE OR REPLACE VIEW derived.product_supplier_mapping AS
SELECT DISTINCT
    barcode AS product_id,
    supplier_name_raw AS supplier_name
FROM raw.raw_purchase_itemwise;

-- product_dimension_view: Recency-aware product identity with app.products overrides
CREATE OR REPLACE VIEW derived.product_dimension AS
WITH item_master_names AS (
    -- Most recent name from item master (raw_item_combinations)
    SELECT DISTINCT ON (barcode)
        barcode,
        item_name_raw,
        imported_at
    FROM raw.raw_item_combinations
    WHERE item_name_raw IS NOT NULL AND item_name_raw != ''
    ORDER BY barcode, imported_at DESC
),
sales_names AS (
    -- Most recent name from sales (raw_sales_itemwise)
    SELECT DISTINCT ON (barcode)
        barcode,
        item_name_raw,
        imported_at
    FROM raw.raw_sales_itemwise
    WHERE item_name_raw IS NOT NULL AND item_name_raw != ''
    ORDER BY barcode, imported_at DESC
),
all_barcodes AS (
    -- Union of all barcodes from sales and item master
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