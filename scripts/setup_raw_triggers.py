"""
Install deduplication indexes and triggers on raw.* tables.

Idempotent — safe to run multiple times. Run AFTER the first ingestion
populates the raw schema (raw tables must exist before triggers can be attached).

    python scripts/setup_raw_triggers.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from config.db import engine


_SQL = """
-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rsb_bill_no
    ON raw.raw_sales_billwise(bill_no);

CREATE INDEX IF NOT EXISTS idx_rsi_bill_barcode
    ON raw.raw_sales_itemwise(bill_no, barcode);

CREATE INDEX IF NOT EXISTS idx_rpb_inv_supp
    ON raw.raw_purchase_billwise(invoice_no, supplier_name_raw);

CREATE INDEX IF NOT EXISTS idx_rpi_inv_bc_supp
    ON raw.raw_purchase_itemwise(invoice_no, barcode, supplier_name_raw);

-- ── Trigger functions ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION raw.dedup_sales_billwise()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bill_no IS NOT NULL AND EXISTS (
        SELECT 1 FROM raw.raw_sales_billwise WHERE bill_no = NEW.bill_no
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION raw.dedup_sales_itemwise()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bill_no IS NOT NULL AND NEW.barcode IS NOT NULL AND EXISTS (
        SELECT 1 FROM raw.raw_sales_itemwise
        WHERE bill_no = NEW.bill_no AND barcode = NEW.barcode
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION raw.dedup_purchase_billwise()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_no IS NOT NULL AND NEW.supplier_name_raw IS NOT NULL AND EXISTS (
        SELECT 1 FROM raw.raw_purchase_billwise
        WHERE invoice_no = NEW.invoice_no
          AND supplier_name_raw = NEW.supplier_name_raw
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION raw.dedup_purchase_itemwise()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_no IS NOT NULL
       AND NEW.barcode IS NOT NULL
       AND NEW.supplier_name_raw IS NOT NULL
       AND EXISTS (
        SELECT 1 FROM raw.raw_purchase_itemwise
        WHERE invoice_no = NEW.invoice_no
          AND barcode = NEW.barcode
          AND supplier_name_raw = NEW.supplier_name_raw
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Triggers (drop-and-recreate for idempotency) ───────────────────────────
DROP TRIGGER IF EXISTS dedup_sales_billwise_trg ON raw.raw_sales_billwise;
CREATE TRIGGER dedup_sales_billwise_trg
    BEFORE INSERT ON raw.raw_sales_billwise
    FOR EACH ROW EXECUTE FUNCTION raw.dedup_sales_billwise();

DROP TRIGGER IF EXISTS dedup_sales_itemwise_trg ON raw.raw_sales_itemwise;
CREATE TRIGGER dedup_sales_itemwise_trg
    BEFORE INSERT ON raw.raw_sales_itemwise
    FOR EACH ROW EXECUTE FUNCTION raw.dedup_sales_itemwise();

DROP TRIGGER IF EXISTS dedup_purchase_billwise_trg ON raw.raw_purchase_billwise;
CREATE TRIGGER dedup_purchase_billwise_trg
    BEFORE INSERT ON raw.raw_purchase_billwise
    FOR EACH ROW EXECUTE FUNCTION raw.dedup_purchase_billwise();

DROP TRIGGER IF EXISTS dedup_purchase_itemwise_trg ON raw.raw_purchase_itemwise;
CREATE TRIGGER dedup_purchase_itemwise_trg
    BEFORE INSERT ON raw.raw_purchase_itemwise
    FOR EACH ROW EXECUTE FUNCTION raw.dedup_purchase_itemwise();
"""

_REQUIRED_TABLES = [
    "raw_sales_billwise",
    "raw_sales_itemwise",
    "raw_purchase_billwise",
    "raw_purchase_itemwise",
]


def main() -> None:
    with engine.connect() as conn:
        missing = [
            t for t in _REQUIRED_TABLES
            if not conn.execute(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'raw' AND table_name = :t"
            ), {"t": t}).scalar()
        ]

    if missing:
        print("Raw tables not found — run ingestion first:")
        for t in missing:
            print(f"  raw.{t}")
        sys.exit(1)

    with engine.begin() as conn:
        conn.execute(text(_SQL))

    print("Raw dedup indexes and triggers installed.")


if __name__ == "__main__":
    main()
