"""Add row-level deduplication triggers on raw transaction tables

Revision ID: 004
Revises: 003
Create Date: 2026-04-12

Trigger logic moved to scripts/setup_raw_triggers.py — raw.* is not managed
by Alembic. Run that script after first ingestion on any new machine.
"""
from alembic import op

revision: str = "004"
down_revision: str = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass  # handled by scripts/setup_raw_triggers.py


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
