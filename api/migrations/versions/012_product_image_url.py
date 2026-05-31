"""012_product_image_url

Revision ID: 012_product_image_url
Revises: 011_campaign_studio
Create Date: 2026-05-31

Add image_url to app.products — stores CDN URL from StorageClient (R2 or local).
Never stores binary; URL points to R2/local static path.
"""
from alembic import op

revision = "012_product_image_url"
down_revision = "011_campaign_studio"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE app.products
            ADD COLUMN IF NOT EXISTS image_url TEXT
    """)


def downgrade():
    op.execute("""
        ALTER TABLE app.products
            DROP COLUMN IF EXISTS image_url
    """)
