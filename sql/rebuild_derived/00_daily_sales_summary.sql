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
WITH billwise_norm AS (
    -- Normalize raw datetime string to always have a space at position 11,
    -- then classify as 12-hour (with AM/PM) or 24-hour (no AM/PM suffix).
    -- Handles three export variants seen in the wild:
    --   "04-04-202507:29 AM"  → old, no space, 12-hour
    --   "04-04-2025 07:29 AM" → new, space, 12-hour
    --   "04-04-2025 18:30"    → new, space, 24-hour
    SELECT
        net_total,
        CASE WHEN SUBSTRING(bill_datetime_raw, 11, 1) = ' '
             THEN bill_datetime_raw
             ELSE SUBSTRING(bill_datetime_raw, 1, 10) || ' ' || SUBSTRING(bill_datetime_raw, 11)
        END AS dt
    FROM raw.raw_sales_billwise
    WHERE bill_datetime_raw IS NOT NULL
      AND bill_datetime_raw ~ '^\d{2}-\d{2}-\d{4}'   -- skip ISO-format or garbage rows
),
bill_agg AS (
    SELECT
        CASE WHEN dt ~* '(AM|PM)\s*$'
             THEN TO_TIMESTAMP(dt, 'DD-MM-YYYY HH12:MI AM')
             ELSE TO_TIMESTAMP(dt, 'DD-MM-YYYY HH24:MI')
        END::DATE          AS sale_date,
        COUNT(*)           AS total_bills,
        SUM(net_total)     AS total_revenue
    FROM billwise_norm
    GROUP BY 1
),
itemwise_norm AS (
    SELECT
        sale_qty,
        CASE WHEN SUBSTRING(sale_datetime_raw, 11, 1) = ' '
             THEN sale_datetime_raw
             ELSE SUBSTRING(sale_datetime_raw, 1, 10) || ' ' || SUBSTRING(sale_datetime_raw, 11)
        END AS dt
    FROM raw.raw_sales_itemwise
    WHERE sale_datetime_raw IS NOT NULL
      AND sale_datetime_raw ~ '^\d{2}-\d{2}-\d{4}'   -- skip ISO-format or garbage rows
),
item_agg AS (
    SELECT
        CASE WHEN dt ~* '(AM|PM)\s*$'
             THEN TO_TIMESTAMP(dt, 'DD-MM-YYYY HH12:MI AM')
             ELSE TO_TIMESTAMP(dt, 'DD-MM-YYYY HH24:MI')
        END::DATE          AS sale_date,
        SUM(sale_qty)      AS total_items_sold
    FROM itemwise_norm
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
