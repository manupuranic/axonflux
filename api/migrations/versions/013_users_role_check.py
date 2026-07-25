"""013_users_role_check

Revision ID: 013_users_role_check
Revises: 012_product_image_url
Create Date: 2026-07-26

Pin valid roles on app.users. No constraint existed before (001 created
role as plain TEXT DEFAULT 'staff'). Existing rows are staff/admin only,
so this applies cleanly.
"""
from alembic import op

revision = "013_users_role_check"
down_revision = "012_product_image_url"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE app.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('staff', 'manager', 'admin'))
    """)


def downgrade():
    op.execute("""
        ALTER TABLE app.users
            DROP CONSTRAINT IF EXISTS users_role_check
    """)
