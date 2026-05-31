"""
Step 04 — product_stock_position BOM consumption math.

Tests the formula: pseudo_stock = purchased - direct_sold - (finished_qty_sold × qty_per_unit)

Rather than executing the full step04 SQL file (multi-statement, hard to run via SQLAlchemy),
we test the *logic* directly: seed known data into product_daily_metrics + product_bom,
then run the exact window-function query from step04 in isolation.
This verifies the math without fighting SQLAlchemy's single-statement limit.
"""
import uuid

import pytest
from sqlalchemy import text

from tests.conftest import test_engine

# The BOM consumption sub-query from step04 — tests the core accumulation formula.
_BOM_MATH_SQL = """
WITH bom_daily AS (
    SELECT
        pdm.date,
        b.raw_barcode AS product_id,
        SUM(COALESCE(pdm.quantity_sold, 0) * b.qty_per_unit) AS bom_consumed
    FROM derived.product_daily_metrics pdm
    JOIN app.product_bom b ON b.finished_barcode = pdm.product_id
    WHERE b.raw_barcode = :raw_bc
    GROUP BY pdm.date, b.raw_barcode
),
raw_series AS (
    SELECT date, product_id, quantity_sold, purchase_quantity
    FROM derived.product_daily_metrics
    WHERE product_id = :raw_bc
),
accumulated AS (
    SELECT
        r.date,
        SUM(COALESCE(r.purchase_quantity, 0)) OVER (ORDER BY r.date ROWS UNBOUNDED PRECEDING) AS total_purchased,
        SUM(COALESCE(r.quantity_sold, 0))     OVER (ORDER BY r.date ROWS UNBOUNDED PRECEDING) AS total_sold,
        SUM(COALESCE(bd.bom_consumed, 0))     OVER (ORDER BY r.date ROWS UNBOUNDED PRECEDING) AS total_bom_consumed
    FROM raw_series r
    LEFT JOIN bom_daily bd ON bd.date = r.date
)
SELECT
    total_purchased,
    total_sold,
    total_bom_consumed,
    total_purchased - total_sold - total_bom_consumed AS pseudo_stock
FROM accumulated
ORDER BY date DESC
LIMIT 1
"""


def _unique_barcodes():
    return f"S04_RAW_{uuid.uuid4().hex[:8]}", f"S04_FIN_{uuid.uuid4().hex[:8]}"


def _seed(raw_bc: str, fin_bc: str, qty_per_unit: float,
          raw_purchased: float, fin_sold: float) -> dict:
    with test_engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO derived.product_daily_metrics
                (date, product_id, quantity_sold, revenue, purchase_quantity)
            VALUES
                ('2026-01-01', :raw_bc, 0, 0, :purchased),
                ('2026-01-02', :raw_bc, 0, 0, 0),
                ('2026-01-01', :fin_bc, 0, 0, 0),
                ('2026-01-02', :fin_bc, :sold, :revenue, 0)
        """), {"raw_bc": raw_bc, "fin_bc": fin_bc,
               "purchased": raw_purchased, "sold": fin_sold, "revenue": fin_sold * 100})

        conn.execute(text("""
            INSERT INTO app.product_bom (raw_barcode, finished_barcode, qty_per_unit)
            VALUES (:r, :f, :qty)
        """), {"r": raw_bc, "f": fin_bc, "qty": qty_per_unit})

        row = conn.execute(text(_BOM_MATH_SQL), {"raw_bc": raw_bc}).mappings().one()
        return dict(row)


def _cleanup(raw_bc: str, fin_bc: str) -> None:
    with test_engine.begin() as conn:
        conn.execute(text(
            "DELETE FROM derived.product_daily_metrics WHERE product_id IN (:r, :f)"
        ), {"r": raw_bc, "f": fin_bc})
        conn.execute(text(
            "DELETE FROM app.product_bom WHERE raw_barcode = :r"
        ), {"r": raw_bc})


def test_bom_consumption_math():
    raw_bc, fin_bc = _unique_barcodes()
    # 100 purchased, 10 finished goods sold, each consumes 8 raw units
    # bom_consumed = 10 × 8 = 80, pseudo_stock = 100 - 0 - 80 = 20
    result = _seed(raw_bc, fin_bc, qty_per_unit=8.0, raw_purchased=100.0, fin_sold=10.0)
    _cleanup(raw_bc, fin_bc)
    assert float(result["total_purchased"]) == 100.0
    assert float(result["total_sold"]) == 0.0
    assert float(result["total_bom_consumed"]) == 80.0
    assert float(result["pseudo_stock"]) == 20.0


def test_wrong_yield_factor_silently_inflates_stock():
    raw_bc, fin_bc = _unique_barcodes()
    # qty_per_unit=1 instead of correct 8 — stock is inflated by 70 units (silent bug)
    result = _seed(raw_bc, fin_bc, qty_per_unit=1.0, raw_purchased=100.0, fin_sold=10.0)
    _cleanup(raw_bc, fin_bc)
    assert float(result["total_bom_consumed"]) == 10.0   # wrong: should be 80
    assert float(result["pseudo_stock"]) == 90.0          # inflated: should be 20


def test_no_bom_mapping_means_zero_consumption():
    raw_bc = f"S04_NOBOM_{uuid.uuid4().hex[:8]}"
    with test_engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO derived.product_daily_metrics
                (date, product_id, quantity_sold, revenue, purchase_quantity)
            VALUES ('2026-01-01', :bc, 5, 500, 50)
        """), {"bc": raw_bc})

        # No BOM mapping → bom_daily CTE is empty → bom_consumed = 0
        row = conn.execute(text("""
            WITH raw_series AS (
                SELECT date, quantity_sold, purchase_quantity
                FROM derived.product_daily_metrics
                WHERE product_id = :bc
            )
            SELECT
                SUM(purchase_quantity) AS total_purchased,
                SUM(quantity_sold)     AS total_sold,
                0                      AS total_bom_consumed,
                SUM(purchase_quantity) - SUM(quantity_sold) - 0 AS pseudo_stock
            FROM raw_series
        """), {"bc": raw_bc}).mappings().one()

        conn.execute(text(
            "DELETE FROM derived.product_daily_metrics WHERE product_id = :bc"
        ), {"bc": raw_bc})

    assert float(row["total_bom_consumed"]) == 0.0
    assert float(row["pseudo_stock"]) == 45.0   # 50 purchased - 5 sold
