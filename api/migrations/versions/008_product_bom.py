"""Product BOM: product_bom and product_bom_suggestions tables

Revision ID: 008
Revises: 007
Create Date: 2026-05-23

Adds two tables to app.* schema:
- app.product_bom: confirmed raw→finished mappings with yield-based qty_per_unit
- app.product_bom_suggestions: auto-detected candidates pending staff review
"""
from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS app.product_bom (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            raw_barcode      TEXT NOT NULL,
            finished_barcode TEXT NOT NULL,
            qty_per_unit     NUMERIC(10,4) NOT NULL,
            notes            TEXT,
            confirmed_by     UUID REFERENCES app.users(id),
            confirmed_at     TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (raw_barcode, finished_barcode)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_bom_raw
            ON app.product_bom (raw_barcode)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_bom_finished
            ON app.product_bom (finished_barcode)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.product_bom_suggestions (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            raw_barcode      TEXT NOT NULL,
            raw_name         TEXT,
            finished_barcode TEXT NOT NULL,
            finished_name    TEXT,
            similarity_score NUMERIC(5,2) NOT NULL,
            status           TEXT NOT NULL DEFAULT 'pending',
            generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (raw_barcode, finished_barcode)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bom_suggestions_status
            ON app.product_bom_suggestions (status, similarity_score DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_bom_suggestions_raw
            ON app.product_bom_suggestions (raw_barcode)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS app.idx_bom_suggestions_raw")
    op.execute("DROP INDEX IF EXISTS app.idx_bom_suggestions_status")
    op.execute("DROP TABLE IF EXISTS app.product_bom_suggestions")
    op.execute("DROP INDEX IF EXISTS app.idx_product_bom_finished")
    op.execute("DROP INDEX IF EXISTS app.idx_product_bom_raw")
    op.execute("DROP TABLE IF EXISTS app.product_bom")
