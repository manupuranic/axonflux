-- Daily Payment Breakdown
-- Aggregates payment methods by day from raw_sales_billwise
-- Tracks cash, card, UPI (combined), credit, credit notes, discounts

CREATE TABLE IF NOT EXISTS derived.daily_payment_breakdown (
    sale_date DATE PRIMARY KEY,
    total_bills INTEGER,
    cash_total NUMERIC,
    card_total NUMERIC,
    google_pay_total NUMERIC,
    phonepe_total NUMERIC,
    paytm_total NUMERIC,
    upi_total NUMERIC,
    credit_total NUMERIC,
    cn_redeemed_total NUMERIC,
    total_discount NUMERIC,
    membercard_discount_total NUMERIC
);

TRUNCATE TABLE derived.daily_payment_breakdown;

INSERT INTO derived.daily_payment_breakdown (
  sale_date,
  total_bills,
  cash_total,
  card_total,
  google_pay_total,
  phonepe_total,
  paytm_total,
  upi_total,
  credit_total,
  cn_redeemed_total,
  total_discount,
  membercard_discount_total
)
WITH norm AS (
    SELECT
        CASE WHEN SUBSTRING(bill_datetime_raw, 11, 1) = ' '
             THEN bill_datetime_raw
             ELSE SUBSTRING(bill_datetime_raw, 1, 10) || ' ' || SUBSTRING(bill_datetime_raw, 11)
        END                                           AS dt,
        actual_cash, cash_amount, card_amount,
        google_pay_amount, phonepe_amount, paytm_amount,
        credit_amount, cn_amount, total_discount, membercard_discount,
        net_total
    FROM raw.raw_sales_billwise
    WHERE bill_datetime_raw IS NOT NULL
      AND bill_datetime_raw ~ '^\d{2}-\d{2}-\d{4}'   -- skip ISO-format or garbage rows
      AND COALESCE(actual_cash, cash_amount, 0) < 1000000
      AND COALESCE(card_amount, 0)              < 1000000
      AND COALESCE(net_total, 0)                < 1000000
)
SELECT
  CASE WHEN dt ~* '(AM|PM)\s*$'
       THEN TO_TIMESTAMP(dt, 'DD-MM-YYYY HH12:MI AM')
       ELSE TO_TIMESTAMP(dt, 'DD-MM-YYYY HH24:MI')
  END::DATE                                                                       AS sale_date,
  COUNT(*)                                                                        AS total_bills,
  COALESCE(SUM(COALESCE(actual_cash, cash_amount, 0)), 0)                        AS cash_total,
  COALESCE(SUM(COALESCE(card_amount, 0)), 0)                                     AS card_total,
  COALESCE(SUM(COALESCE(google_pay_amount, 0)), 0)                               AS google_pay_total,
  COALESCE(SUM(COALESCE(phonepe_amount, 0)), 0)                                  AS phonepe_total,
  COALESCE(SUM(COALESCE(paytm_amount, 0)), 0)                                    AS paytm_total,
  COALESCE(SUM(COALESCE(google_pay_amount, 0) + COALESCE(phonepe_amount, 0)
               + COALESCE(paytm_amount, 0)), 0)                                  AS upi_total,
  COALESCE(SUM(COALESCE(credit_amount, 0)), 0)                                   AS credit_total,
  COALESCE(SUM(COALESCE(cn_amount, 0)), 0)                                       AS cn_redeemed_total,
  COALESCE(SUM(COALESCE(total_discount, 0)), 0)                                  AS total_discount,
  COALESCE(SUM(COALESCE(membercard_discount, 0)), 0)                             AS membercard_discount_total
FROM norm
GROUP BY 1
ORDER BY sale_date DESC;
