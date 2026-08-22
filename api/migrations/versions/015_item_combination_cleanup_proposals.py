"""015_cleanup_proposals

Revision ID: 015_cleanup_proposals
Revises: 014_item_combination_cleanup
Create Date: 2026-08-15

Phase 2 proposal rows + run summary for Item Combination Cleanup.
"""
from alembic import op

revision = "015_cleanup_proposals"
down_revision = "014_item_combination_cleanup"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE app.item_combination_cleanup_runs
            ADD COLUMN IF NOT EXISTS summary_json JSONB
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS app.item_combination_cleanup_rows (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id UUID NOT NULL REFERENCES app.item_combination_cleanup_runs(id) ON DELETE CASCADE,
            row_index INTEGER NOT NULL,
            item_id_key TEXT NOT NULL,
            source_identity JSONB NOT NULL,
            original_item_name TEXT,
            original_brand TEXT,
            original_size TEXT,
            original_hsn TEXT,
            proposed_item_name TEXT,
            proposed_size TEXT,
            proposed_brand TEXT,
            product_type TEXT NOT NULL,
            classification_confidence TEXT,
            supplier_name TEXT,
            supplier_purchase_date DATE,
            supplier_purchase_id TEXT,
            supplier_invoice_no TEXT,
            supplier_source_file TEXT,
            supplier_match_method TEXT,
            classification_evidence JSONB,
            name_evidence JSONB,
            review_status TEXT NOT NULL
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_combination_cleanup_rows_run
            ON app.item_combination_cleanup_rows (run_id)
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_item_combination_cleanup_rows_run_item
            ON app.item_combination_cleanup_rows (run_id, item_id_key)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS app.item_combination_cleanup_rows")
    op.execute("""
        ALTER TABLE app.item_combination_cleanup_runs
            DROP COLUMN IF EXISTS summary_json
    """)
