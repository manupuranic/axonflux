-- Step 00: Daily Sales & Purchase Summaries
-- Must run BEFORE step 01 (product_daily_metrics uses MIN(sale_date) from here as date-spine anchor)

CREATE TABLE IF NOT EXISTS derived.daily_sales_summary (
    sale_date         DATE PRIMARY KEY,
    total_bills       INTEGER,
    total_items_sold  NUMERIC,
    total_revenue     NUMERIC,
    avg_bill_value    NUMERIC,
    created_at        TIMESTAMP DEFAULT NOW()
);

TRUNCATE TABLE derived.daily_sales_summary;

INSERT INTO derived.daily_sales_summary (
    sale_date,
    total_bills,
    total_items_sold,
    total_revenue,
    avg_bill_value
)
WITH bill_agg AS (
    SELECT
        TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE AS sale_date,
        COUNT(*)                                                        AS total_bills,
        SUM(net_total)                                                  AS total_revenue
    FROM raw.raw_sales_billwise
    WHERE bill_datetime_raw IS NOT NULL
    GROUP BY 1
),
item_agg AS (
    SELECT
        TO_TIMESTAMP(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE AS sale_date,
        SUM(sale_qty)                                                   AS total_items_sold
    FROM raw.raw_sales_itemwise
    WHERE sale_datetime_raw IS NOT NULL
    GROUP BY 1
)
SELECT
    COALESCE(b.sale_date, i.sale_date)                                 AS sale_date,
    b.total_bills,
    i.total_items_sold,
    b.total_revenue,
    CASE
        WHEN COALESCE(b.total_bills, 0) > 0 THEN b.total_revenue / b.total_bills
        ELSE NULL
    END                                                                AS avg_bill_value
FROM bill_agg b
FULL OUTER JOIN item_agg i ON b.sale_date = i.sale_date
WHERE COALESCE(b.sale_date, i.sale_date) IS NOT NULL;

-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS derived.daily_purchase_summary (
    purchase_date            DATE PRIMARY KEY,
    total_purchase_bills     INTEGER,
    total_quantity_purchased NUMERIC,
    total_taxable_value      NUMERIC,
    total_settled_amount     NUMERIC,
    total_due_amount         NUMERIC,
    created_at               TIMESTAMP DEFAULT NOW()
);

TRUNCATE TABLE derived.daily_purchase_summary;

INSERT INTO derived.daily_purchase_summary (
    purchase_date,
    total_purchase_bills,
    total_quantity_purchased,
    total_taxable_value,
    total_settled_amount,
    total_due_amount
)
WITH bill_agg AS (
    SELECT
        TO_DATE(purchase_date_raw, 'DD-MM-YYYY') AS purchase_date,
        COUNT(*)                                  AS total_purchase_bills,
        SUM(taxable_value)                        AS total_taxable_value,
        SUM(settled_amount)                       AS total_settled_amount,
        SUM(due_amount)                           AS total_due_amount
    FROM raw.raw_purchase_billwise
    WHERE purchase_date_raw IS NOT NULL
    GROUP BY 1
),
item_agg AS (
    SELECT
        TO_DATE(purchase_date_raw, 'DD-MM-YYYY') AS purchase_date,
        SUM(total_qty)                            AS total_quantity_purchased
    FROM raw.raw_purchase_itemwise
    WHERE purchase_date_raw IS NOT NULL
    GROUP BY 1
)
SELECT
    COALESCE(b.purchase_date, i.purchase_date)  AS purchase_date,
    b.total_purchase_bills,
    i.total_quantity_purchased,
    b.total_taxable_value,
    b.total_settled_amount,
    b.total_due_amount
FROM bill_agg b
FULL OUTER JOIN item_agg i ON b.purchase_date = i.purchase_date
WHERE COALESCE(b.purchase_date, i.purchase_date) IS NOT NULL;
