"""Add row-level deduplication triggers on raw transaction tables

Revision ID: 004
Revises: 003
Create Date: 2026-04-12

Adds BEFORE INSERT FOR EACH ROW triggers on the four transaction tables so
that re-ingesting an overlapping date range (e.g. last 45 days) silently
skips already-seen bills/invoices while still picking up any backdated
entries with new business keys.

Master tables (raw_item_combinations, raw_supplier_master) are intentionally
excluded — they are historical snapshots where multiple rows per barcode/
supplier are expected.

Business keys
-------------
raw_sales_billwise    : bill_no
raw_sales_itemwise    : bill_no + barcode
raw_purchase_billwise : invoice_no + supplier_name_raw
raw_purchase_itemwise : invoice_no + barcode + supplier_name_raw

Null guard: if any key column IS NULL, the row is allowed through — avoids
incorrectly blocking legitimate rows with missing identifiers.
"""
from alembic import op

revision: str = "004"
down_revision: str = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Performance indexes — must exist BEFORE triggers so the EXISTS
    # sub-selects inside them are O(log n) rather than O(n).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rsb_bill_no
            ON raw.raw_sales_billwise(bill_no);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rsi_bill_barcode
            ON raw.raw_sales_itemwise(bill_no, barcode);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rpb_inv_supp
            ON raw.raw_purchase_billwise(invoice_no, supplier_name_raw);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_rpi_inv_bc_supp
            ON raw.raw_purchase_itemwise(invoice_no, barcode, supplier_name_raw);
    """)

    # ------------------------------------------------------------------
    # raw_sales_billwise — dedup on bill_no
    # ------------------------------------------------------------------
    op.execute("""
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
    """)

    op.execute("""
        CREATE TRIGGER dedup_sales_billwise_trg
        BEFORE INSERT ON raw.raw_sales_billwise
        FOR EACH ROW EXECUTE FUNCTION raw.dedup_sales_billwise();
    """)

    # ------------------------------------------------------------------
    # raw_sales_itemwise — dedup on (bill_no, barcode)
    # ------------------------------------------------------------------
    op.execute("""
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
    """)

    op.execute("""
        CREATE TRIGGER dedup_sales_itemwise_trg
        BEFORE INSERT ON raw.raw_sales_itemwise
        FOR EACH ROW EXECUTE FUNCTION raw.dedup_sales_itemwise();
    """)

    # ------------------------------------------------------------------
    # raw_purchase_billwise — dedup on (invoice_no, supplier_name_raw)
    # ------------------------------------------------------------------
    op.execute("""
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
    """)

    op.execute("""
        CREATE TRIGGER dedup_purchase_billwise_trg
        BEFORE INSERT ON raw.raw_purchase_billwise
        FOR EACH ROW EXECUTE FUNCTION raw.dedup_purchase_billwise();
    """)

    # ------------------------------------------------------------------
    # raw_purchase_itemwise — dedup on (invoice_no, barcode, supplier_name_raw)
    # ------------------------------------------------------------------
    op.execute("""
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
    """)

    op.execute("""
        CREATE TRIGGER dedup_purchase_itemwise_trg
        BEFORE INSERT ON raw.raw_purchase_itemwise
        FOR EACH ROW EXECUTE FUNCTION raw.dedup_purchase_itemwise();
    """)


def downgrade() -> None:
    # Drop triggers first, then functions, then indexes
    op.execute("DROP TRIGGER IF EXISTS dedup_purchase_itemwise_trg ON raw.raw_purchase_itemwise;")
    op.execute("DROP TRIGGER IF EXISTS dedup_purchase_billwise_trg ON raw.raw_purchase_billwise;")
    op.execute("DROP TRIGGER IF EXISTS dedup_sales_itemwise_trg ON raw.raw_sales_itemwise;")
    op.execute("DROP TRIGGER IF EXISTS dedup_sales_billwise_trg ON raw.raw_sales_billwise;")

    op.execute("DROP FUNCTION IF EXISTS raw.dedup_purchase_itemwise();")
    op.execute("DROP FUNCTION IF EXISTS raw.dedup_purchase_billwise();")
    op.execute("DROP FUNCTION IF EXISTS raw.dedup_sales_itemwise();")
    op.execute("DROP FUNCTION IF EXISTS raw.dedup_sales_billwise();")

    op.execute("DROP INDEX IF EXISTS raw.idx_rpi_inv_bc_supp;")
    op.execute("DROP INDEX IF EXISTS raw.idx_rpb_inv_supp;")
    op.execute("DROP INDEX IF EXISTS raw.idx_rsi_bill_barcode;")
    op.execute("DROP INDEX IF EXISTS raw.idx_rsb_bill_no;")
