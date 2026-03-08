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
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    supplier_name_raw AS supplier_name,
    min_stock
FROM raw.raw_purchase_itemwise
ORDER BY barcode, purchase_date_raw DESC;

-- product_dimension_view: 
CREATE OR REPLACE VIEW derived.product_dimension AS
SELECT DISTINCT ON (barcode)
    barcode AS product_id,
    item_name_raw AS product_name
FROM raw.raw_sales_itemwise
ORDER BY barcode;