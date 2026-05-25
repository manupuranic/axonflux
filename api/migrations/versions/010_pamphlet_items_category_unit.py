"""010_pamphlet_items_category_unit

Revision ID: 010_pamphlet_items_category_unit
Revises: 009_pamphlet_dsl
Create Date: 2026-05-25 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "010_pamphlet_items_category_unit"
down_revision = "009_pamphlet_dsl"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pamphlet_items", sa.Column("category", sa.Text, nullable=True), schema="app")
    op.add_column("pamphlet_items", sa.Column("unit", sa.Text, nullable=True), schema="app")


def downgrade():
    op.drop_column("pamphlet_items", "unit", schema="app")
    op.drop_column("pamphlet_items", "category", schema="app")
