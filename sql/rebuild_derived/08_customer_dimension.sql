-- Customer Dimension
-- One row per normalized mobile number (+ one synthetic WALK-IN row)
-- Mobile normalization handles: raw 10-digit, +91 prefix, 91 prefix, 0 prefix

CREATE TABLE IF NOT EXISTS derived.customer_dimension (
    mobile_clean          TEXT PRIMARY KEY,   -- 10-digit Indian mobile, or 'WALK-IN'
    display_name          TEXT,               -- mode (most-frequent) customer name
    is_walk_in            BOOLEAN NOT NULL DEFAULT FALSE,
    is_member             BOOLEAN NOT NULL DEFAULT FALSE,  -- ever had membercard_discount > 0
    first_seen_date       DATE,
    last_seen_date        DATE,
    total_bills           INTEGER
);

TRUNCATE TABLE derived.customer_dimension;

INSERT INTO derived.customer_dimension (
    mobile_clean,
    display_name,
    is_walk_in,
    is_member,
    first_seen_date,
    last_seen_date,
    total_bills
)
WITH normalized AS (
    SELECT
        bill_no,
        TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE AS bill_date,
        customer_name_raw,
        COALESCE(membercard_discount, 0)                               AS membercard_discount,
        -- Normalize mobile to clean 10-digit or NULL
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
        bill_no,
        bill_date,
        customer_name_raw,
        membercard_discount,
        mobile_clean,
        -- Walk-in if mobile is invalid OR name is a known walk-in placeholder
        CASE
            WHEN mobile_clean IS NULL THEN TRUE
            WHEN UPPER(TRIM(COALESCE(customer_name_raw, ''))) IN (
                'CASH', 'X', 'MR', 'PTF', 'SUNDRY', 'RETAIL', 'CUSTOMER',
                'CASH CUSTOMER', 'GENERAL', 'GENERAL CUSTOMER',
                'WALK IN', 'WALK-IN', 'WALKIN', 'RETAIL CUSTOMER'
            ) THEN TRUE
            ELSE FALSE
        END AS is_walk_in
    FROM normalized
),
-- Aggregate identified customers (non-walk-in)
identified AS (
    SELECT
        mobile_clean,
        MODE() WITHIN GROUP (ORDER BY TRIM(customer_name_raw)) AS display_name,
        FALSE                                                   AS is_walk_in,
        BOOL_OR(membercard_discount > 0)                       AS is_member,
        MIN(bill_date)                                         AS first_seen_date,
        MAX(bill_date)                                         AS last_seen_date,
        COUNT(*)                                               AS total_bills
    FROM classified
    WHERE is_walk_in = FALSE AND mobile_clean IS NOT NULL
    GROUP BY mobile_clean
),
-- Aggregate all walk-in bills into a single synthetic row
walk_in AS (
    SELECT
        'WALK-IN'                                           AS mobile_clean,
        'Walk-in / Retail'                                  AS display_name,
        TRUE                                                AS is_walk_in,
        BOOL_OR(membercard_discount > 0)                   AS is_member,
        MIN(bill_date)                                     AS first_seen_date,
        MAX(bill_date)                                     AS last_seen_date,
        COUNT(*)                                           AS total_bills
    FROM classified
    WHERE is_walk_in = TRUE
)
SELECT * FROM identified
UNION ALL
SELECT * FROM walk_in;

CREATE INDEX IF NOT EXISTS idx_customer_dim_walkin
ON derived.customer_dimension (is_walk_in);
