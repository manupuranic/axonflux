CREATE SCHEMA IF NOT EXISTS derived;

CREATE TABLE derived.daily_sales_summary (
    sale_date              date PRIMARY KEY,
    total_bills            integer,
    total_items_sold       numeric,
    total_revenue          numeric,
    avg_bill_value         numeric,
    created_at             timestamp without time zone DEFAULT now()
);

-- Aggregate to summarize daily sales performance
WITH bill_agg AS (
    SELECT
        to_timestamp(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
        COUNT(*)                                                     AS total_bills,
        SUM(net_total)                                               AS total_revenue
    FROM raw.raw_sales_billwise
    GROUP BY 1
),
item_agg AS (
    SELECT
        to_timestamp(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
        SUM(sale_qty)                                                 AS total_items_sold
    FROM raw.raw_sales_itemwise
    GROUP BY 1
)
SELECT
    COALESCE(b.sale_date, i.sale_date)                               AS sale_date,
    b.total_bills,
    i.total_items_sold,
    b.total_revenue,
    CASE
        WHEN b.total_bills > 0 THEN b.total_revenue / b.total_bills
        ELSE NULL
    END                                                              AS avg_bill_value
FROM bill_agg b
FULL OUTER JOIN item_agg i
    ON b.sale_date = i.sale_date;

-- Daily refresh:
TRUNCATE TABLE derived.daily_sales_summary;

INSERT INTO derived.daily_sales_summary (
    sale_date,
    total_bills,
    total_items_sold,
    total_revenue,
    avg_bill_value
)
SELECT * FROM (
    WITH bill_agg AS (
    SELECT *
    FROM (
        SELECT
            to_timestamp(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
            COUNT(*)                                                     AS total_bills,
            SUM(net_total)                                               AS total_revenue
        FROM raw.raw_sales_billwise
        GROUP BY 1
    ) t
    WHERE sale_date IS NOT NULL
),
item_agg AS (
    SELECT *
    FROM (
        SELECT
            to_timestamp(sale_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::date AS sale_date,
            SUM(sale_qty)                                                 AS total_items_sold
        FROM raw.raw_sales_itemwise
        GROUP BY 1
    ) t
    WHERE sale_date IS NOT NULL
)
SELECT
    COALESCE(b.sale_date, i.sale_date) AS sale_date,
    b.total_bills,
    i.total_items_sold,
    b.total_revenue,
    CASE
        WHEN b.total_bills > 0 THEN b.total_revenue / b.total_bills
        ELSE NULL
    END AS avg_bill_value
FROM bill_agg b
FULL OUTER JOIN item_agg i
    ON b.sale_date = i.sale_date
) t;

-- Daily purchase summary table
CREATE TABLE IF NOT EXISTS derived.daily_purchase_summary (
    purchase_date           date PRIMARY KEY,
    total_purchase_bills    integer,
    total_quantity_purchased numeric,
    total_taxable_value     numeric,
    total_settled_amount    numeric,
    total_due_amount        numeric,
    created_at              timestamp without time zone DEFAULT now()
);

