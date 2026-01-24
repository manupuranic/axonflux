-- This view compares bill-wise totals with item-wise aggregates to identify discrepancies.
-- It aggregates item-wise data and joins it with bill-wise data to compute deltas.
-- Any discrepancies found can help in identifying data entry errors or inconsistencies in the sales records.
-- The view includes:
-- - Bill details (bill number, date/time, operator, location)
-- Bill-wise totals (total quantity, taxable amount, net total, round off)
-- - Item-wise aggregates (number of item lines, total item quantity, item taxable amount, item net total)
-- - Deltas between bill-wise totals and item-wise aggregates for taxable amount and net total.

CREATE OR REPLACE VIEW recon.sales_bill_vs_item AS
WITH item_agg AS (
    SELECT
        bill_no,
        sale_datetime_raw AS bill_datetime_raw,
        operator_name,
        sale_location     AS location_name,

        COUNT(*)                         AS item_line_count,
        SUM(sale_qty)                    AS total_item_qty,
        SUM(COALESCE(taxable_amount, 0)) AS item_taxable_amount,
        SUM(COALESCE(net_total, 0))      AS item_net_total
    FROM raw.raw_sales_itemwise
    GROUP BY
        bill_no,
        sale_datetime_raw,
        operator_name,
        sale_location
)
SELECT
    b.bill_no,
    b.bill_datetime_raw,
    b.operator_name,
    b.location_name,

    -- Bill-wise values
    b.total_qty        AS bill_total_qty,
    b.taxable_amount   AS bill_taxable_amount,
    b.net_total        AS bill_net_total,
    b.round_off        AS bill_round_off,

    -- Item-wise aggregates
    i.item_line_count,
    i.total_item_qty,
    i.item_taxable_amount,
    i.item_net_total,

    -- Deltas
    (b.taxable_amount - i.item_taxable_amount) AS delta_taxable_amount,
    (b.net_total - i.item_net_total)            AS delta_net_total

FROM raw.raw_sales_billwise b
LEFT JOIN item_agg i
  ON b.bill_no            = i.bill_no
 AND b.bill_datetime_raw  = i.bill_datetime_raw
 AND b.operator_name      = i.operator_name
 AND b.location_name      = i.location_name;

-- Example query to find discrepancies
-- This query retrieves all records from the view where there is a non-zero delta in net total
SELECT *
FROM recon.sales_bill_vs_item
WHERE ABS(delta_net_total) != 0
ORDER BY ABS(delta_net_total) DESC;


-- Purchase salewise vs itemwise reconciliation view

CREATE OR REPLACE VIEW recon.purchase_bill_vs_item AS
WITH item_agg AS (
    SELECT
        purchase_id,
        invoice_no,

        COUNT(*)                         AS item_line_count,
        SUM(COALESCE(total_qty, 0))      AS item_total_qty,
        SUM(COALESCE(taxable_value, 0))  AS item_taxable_value

    FROM raw.raw_purchase_itemwise
    GROUP BY
        purchase_id,
        invoice_no
)
SELECT
    b.purchase_id,
    b.invoice_no,
    b.purchase_date_raw,
    b.supplier_name_raw,

    -- Bill-wise values
    b.total_qty        AS bill_total_qty,
    b.taxable_value    AS bill_taxable_value,

    -- Item-wise aggregates
    i.item_line_count,
    i.item_total_qty,
    i.item_taxable_value,

    -- Deltas
    (b.total_qty     - i.item_total_qty)     AS delta_qty,
    (b.taxable_value - i.item_taxable_value) AS delta_taxable_value

FROM raw.raw_purchase_billwise b
LEFT JOIN item_agg i
  ON b.purchase_id = i.purchase_id
 AND b.invoice_no  = i.invoice_no;

-- View to track daily quantity flow from purchases and sales
CREATE OR REPLACE VIEW recon.daily_quantity_flow AS
WITH purchases AS (
    SELECT
        to_date(purchase_date_raw, 'DD-MM-YYYY') AS day,
        SUM(COALESCE(total_qty, 0))               AS purchased_qty
    FROM raw.raw_purchase_itemwise
    GROUP BY 1
),
sales AS (
    SELECT
        to_timestamp(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS day,
        SUM(COALESCE(sale_qty, 0))                                   AS sold_qty
    FROM raw.raw_sales_itemwise
    GROUP BY 1
)
SELECT
    COALESCE(p.day, s.day) AS day,
    p.purchased_qty,
    s.sold_qty,
    (p.purchased_qty - s.sold_qty) AS net_flow
FROM purchases p
FULL OUTER JOIN sales s
  ON p.day = s.day
ORDER BY day;
