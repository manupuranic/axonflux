"""Add layout config and image support to pamphlet tables

Revision ID: 005
Revises: 004
Create Date: 2026-04-19

Adds rows/cols grid config to app.pamphlets.
Adds image_url to app.pamphlet_items.
Makes barcode nullable to support custom (non-catalog) products.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE app.pamphlets ADD COLUMN IF NOT EXISTS rows INTEGER NOT NULL DEFAULT 4")
    op.execute("ALTER TABLE app.pamphlets ADD COLUMN IF NOT EXISTS cols INTEGER NOT NULL DEFAULT 5")
    op.execute("ALTER TABLE app.pamphlet_items ADD COLUMN IF NOT EXISTS image_url TEXT")
    op.execute("ALTER TABLE app.pamphlet_items ALTER COLUMN barcode DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE app.pamphlet_items ALTER COLUMN barcode SET NOT NULL")
    op.execute("ALTER TABLE app.pamphlet_items DROP COLUMN IF EXISTS image_url")
    op.execute("ALTER TABLE app.pamphlets DROP COLUMN IF EXISTS cols")
    op.execute("ALTER TABLE app.pamphlets DROP COLUMN IF EXISTS rows")
