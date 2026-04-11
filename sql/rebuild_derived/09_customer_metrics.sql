-- Customer Metrics
-- Per-customer spend and behavioural aggregates
-- Joins to customer_dimension for the mobile_clean key

CREATE TABLE IF NOT EXISTS derived.customer_metrics (
    mobile_clean              TEXT PRIMARY KEY,
    total_revenue             NUMERIC,
    total_bills               INTEGER,
    avg_bill_value            NUMERIC,
    total_discount_received   NUMERIC,
    first_purchase_date       DATE,
    last_purchase_date        DATE,
    days_since_last_visit     INTEGER,
    avg_days_between_visits   NUMERIC,   -- NULL for single-visit customers
    is_repeat                 BOOLEAN,
    preferred_payment         TEXT        -- 'cash' | 'card' | 'upi' | 'credit'
);

TRUNCATE TABLE derived.customer_metrics;

INSERT INTO derived.customer_metrics (
    mobile_clean,
    total_revenue,
    total_bills,
    avg_bill_value,
    total_discount_received,
    first_purchase_date,
    last_purchase_date,
    days_since_last_visit,
    avg_days_between_visits,
    is_repeat,
    preferred_payment
)
WITH normalized AS (
    SELECT
        bill_no,
        TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE AS bill_date,
        customer_name_raw,
        COALESCE(net_total, 0)            AS net_total,
        COALESCE(total_discount, 0)       AS total_discount,
        COALESCE(membercard_discount, 0)  AS membercard_discount,
        COALESCE(actual_cash, cash_amount, 0)                               AS cash_amt,
        COALESCE(card_amount, 0)                                            AS card_amt,
        COALESCE(google_pay_amount, 0) + COALESCE(phonepe_amount, 0)
            + COALESCE(paytm_amount, 0)                                     AS upi_amt,
        COALESCE(credit_amount, 0)                                          AS credit_amt,
        -- Same normalization as customer_dimension
        CASE
            WHEN REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g')
                     ~ '^91([6-9][0-9]{9})$'
                THEN SUBSTRING(
                         REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g'),
                         3
                     )
            WHEN REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g')
                     ~ '^0([6-9][0-9]{9})$'
                THEN SUBSTRING(
                         REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g'),
                         2
                     )
            WHEN REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g')
                     ~ '^[6-9][0-9]{9}$'
                THEN REGEXP_REPLACE(COALESCE(customer_mobile_raw, ''), '[^0-9]', '', 'g')
            ELSE NULL
        END AS mobile_clean
    FROM raw.raw_sales_billwise
    WHERE bill_datetime_raw IS NOT NULL
),
classified AS (
    SELECT
        *,
        CASE
            WHEN mobile_clean IS NULL THEN 'WALK-IN'
            WHEN UPPER(TRIM(COALESCE(customer_name_raw, ''))) IN (
                'CASH', 'X', 'MR', 'PTF', 'SUNDRY', 'RETAIL', 'CUSTOMER',
                'CASH CUSTOMER', 'GENERAL', 'GENERAL CUSTOMER',
                'WALK IN', 'WALK-IN', 'WALKIN', 'RETAIL CUSTOMER'
            ) THEN 'WALK-IN'
            ELSE mobile_clean
        END AS customer_key
    FROM normalized
),
agg AS (
    SELECT
        customer_key                             AS mobile_clean,
        SUM(net_total)                           AS total_revenue,
        COUNT(*)                                 AS total_bills,
        AVG(net_total)                           AS avg_bill_value,
        SUM(total_discount)                      AS total_discount_received,
        MIN(bill_date)                           AS first_purchase_date,
        MAX(bill_date)                           AS last_purchase_date,
        -- Days since last visit
        (CURRENT_DATE - MAX(bill_date))          AS days_since_last_visit,
        -- Avg days between visits (range / (bills-1)); NULL for single-visit
        CASE
            WHEN COUNT(*) > 1
                THEN (MAX(bill_date) - MIN(bill_date))::NUMERIC / (COUNT(*) - 1)
            ELSE NULL
        END                                      AS avg_days_between_visits,
        COUNT(*) > 1                             AS is_repeat,
        -- Preferred payment: whichever method has the highest total
        SUM(cash_amt)                            AS sum_cash,
        SUM(card_amt)                            AS sum_card,
        SUM(upi_amt)                             AS sum_upi,
        SUM(credit_amt)                          AS sum_credit
    FROM classified
    GROUP BY customer_key
)
SELECT
    mobile_clean,
    total_revenue,
    total_bills,
    avg_bill_value,
    total_discount_received,
    first_purchase_date,
    last_purchase_date,
    days_since_last_visit,
    avg_days_between_visits,
    is_repeat,
    CASE
        WHEN GREATEST(sum_cash, sum_card, sum_upi, sum_credit) = sum_cash    THEN 'cash'
        WHEN GREATEST(sum_cash, sum_card, sum_upi, sum_credit) = sum_card    THEN 'card'
        WHEN GREATEST(sum_cash, sum_card, sum_upi, sum_credit) = sum_upi     THEN 'upi'
        WHEN GREATEST(sum_cash, sum_card, sum_upi, sum_credit) = sum_credit  THEN 'credit'
        ELSE 'cash'
    END AS preferred_payment
FROM agg;

CREATE INDEX IF NOT EXISTS idx_customer_metrics_revenue
ON derived.customer_metrics (total_revenue DESC);
