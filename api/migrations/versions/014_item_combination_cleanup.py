"""014_item_combination_cleanup

Revision ID: 014_item_combination_cleanup
Revises: 013_users_role_check
Create Date: 2026-08-15

Phase 1 run table for ER4U Item Combination workbook upload/export.
"""
from alembic import op

revision = "014_item_combination_cleanup"
down_revision = "013_users_role_check"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS app.item_combination_cleanup_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_by UUID REFERENCES app.users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status TEXT NOT NULL DEFAULT 'uploaded',
            source_file_name TEXT NOT NULL,
            original_path TEXT NOT NULL,
            output_path TEXT,
            sheet_name TEXT,
            header_row INTEGER,
            row_count INTEGER,
            column_count INTEGER,
            headers JSONB,
            validation_status TEXT,
            error_message TEXT
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_item_combination_cleanup_runs_created
            ON app.item_combination_cleanup_runs (created_at DESC)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS app.item_combination_cleanup_runs")
