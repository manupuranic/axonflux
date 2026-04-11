"""Add product_type, is_reviewed, size, colour to app.products

Revision ID: 002
Revises: 001
Create Date: 2026-04-11

These fields support the canonical product workflow:
- product_type: retail, service, bulk, misc
- is_reviewed: tracks whether staff has verified this product record
- size, colour: normalized from raw data
"""
from alembic import op

revision: str = "002"
down_revision: str = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE app.products
            ADD COLUMN IF NOT EXISTS product_type  TEXT    DEFAULT 'retail',
            ADD COLUMN IF NOT EXISTS is_reviewed   BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS size          TEXT,
            ADD COLUMN IF NOT EXISTS colour        TEXT
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE app.products
            DROP COLUMN IF EXISTS product_type,
            DROP COLUMN IF EXISTS is_reviewed,
            DROP COLUMN IF EXISTS size,
            DROP COLUMN IF EXISTS colour
    """)
