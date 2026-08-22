"""016_cleanup_row_approvals

Revision ID: 016_cleanup_row_approvals
Revises: 015_cleanup_proposals
"""
from alembic import op

revision = "016_cleanup_row_approvals"
down_revision = "015_cleanup_proposals"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE app.item_combination_cleanup_runs ADD COLUMN IF NOT EXISTS approved_output_path TEXT")
    op.execute("ALTER TABLE app.item_combination_cleanup_rows ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING'")
    op.execute("ALTER TABLE app.item_combination_cleanup_rows ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES app.users(id)")
    op.execute("ALTER TABLE app.item_combination_cleanup_rows ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ")


def downgrade():
    op.execute("ALTER TABLE app.item_combination_cleanup_rows DROP COLUMN IF EXISTS reviewed_at")
    op.execute("ALTER TABLE app.item_combination_cleanup_rows DROP COLUMN IF EXISTS reviewed_by")
    op.execute("ALTER TABLE app.item_combination_cleanup_rows DROP COLUMN IF EXISTS approval_status")
    op.execute("ALTER TABLE app.item_combination_cleanup_runs DROP COLUMN IF EXISTS approved_output_path")
