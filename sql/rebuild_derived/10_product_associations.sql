-- Product Associations (basket analysis)
-- Co-occurrence pairs from raw_sales_itemwise self-join on bill_no.
-- Metrics: support, confidence (both directions), lift.
-- min_cooccurrences = 5 — filters noise from single-bill anomalies.

CREATE TABLE IF NOT EXISTS derived.product_associations (
    barcode_a           TEXT        NOT NULL,
    barcode_b           TEXT        NOT NULL,
    co_occurrences      INTEGER     NOT NULL,
    support             NUMERIC(8,6) NOT NULL,  -- P(A∩B)
    confidence_a_to_b   NUMERIC(6,4) NOT NULL,  -- P(B|A)
    confidence_b_to_a   NUMERIC(6,4) NOT NULL,  -- P(A|B)
    lift                NUMERIC(8,4) NOT NULL,   -- support / (P(A)*P(B))
    PRIMARY KEY (barcode_a, barcode_b)
);

TRUNCATE TABLE derived.product_associations;

INSERT INTO derived.product_associations (
    barcode_a,
    barcode_b,
    co_occurrences,
    support,
    confidence_a_to_b,
    confidence_b_to_a,
    lift
)
WITH total_bills AS (
    SELECT COUNT(DISTINCT bill_no)::numeric AS n
    FROM raw.raw_sales_itemwise
    WHERE bill_no IS NOT NULL
),
item_bills AS (
    SELECT barcode, COUNT(DISTINCT bill_no) AS bill_count
    FROM raw.raw_sales_itemwise
    WHERE barcode IS NOT NULL AND bill_no IS NOT NULL
    GROUP BY barcode
),
pairs AS (
    SELECT
        LEAST(a.barcode, b.barcode)    AS barcode_a,
        GREATEST(a.barcode, b.barcode) AS barcode_b,
        COUNT(DISTINCT a.bill_no)      AS co_occurrences
    FROM raw.raw_sales_itemwise a
    JOIN raw.raw_sales_itemwise b
        ON  a.bill_no  = b.bill_no
        AND a.barcode != b.barcode
    WHERE a.barcode IS NOT NULL AND b.barcode IS NOT NULL
      AND a.bill_no  IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT a.bill_no) >= 5
)
SELECT
    p.barcode_a,
    p.barcode_b,
    p.co_occurrences,
    ROUND(p.co_occurrences / tb.n,                                     6) AS support,
    ROUND(p.co_occurrences / ca.bill_count::numeric,                   4) AS confidence_a_to_b,
    ROUND(p.co_occurrences / cb.bill_count::numeric,                   4) AS confidence_b_to_a,
    ROUND(
        (p.co_occurrences / tb.n)
        / ((ca.bill_count / tb.n) * (cb.bill_count / tb.n)),
        4
    ) AS lift
FROM pairs p
JOIN item_bills   ca ON p.barcode_a = ca.barcode
JOIN item_bills   cb ON p.barcode_b = cb.barcode
CROSS JOIN total_bills tb
ORDER BY p.co_occurrences DESC;
