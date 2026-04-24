"""Product entity resolution: product_aliases and product_merge_suggestions

Revision ID: 006
Revises: 005
Create Date: 2026-04-25

Adds two tables to app.* schema:
- app.product_aliases: confirmed barcode alias map (alias_barcode → canonical_barcode)
- app.product_merge_suggestions: transient review queue populated by the clustering script
"""
from typing import Sequence, Union

from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS app.product_aliases (
            alias_barcode     TEXT PRIMARY KEY,
            canonical_barcode TEXT NOT NULL REFERENCES app.products(barcode) ON UPDATE CASCADE,
            similarity_score  NUMERIC(5,2),
            confirmed_by      UUID REFERENCES app.users(id),
            confirmed_at      TIMESTAMPTZ DEFAULT NOW(),
            notes             TEXT
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_aliases_canonical
            ON app.product_aliases (canonical_barcode)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.product_merge_suggestions (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            cluster_key         TEXT NOT NULL,
            alias_barcode       TEXT NOT NULL,
            canonical_candidate TEXT NOT NULL,
            alias_name          TEXT,
            canonical_name      TEXT,
            similarity_score    NUMERIC(5,2) NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_by         UUID REFERENCES app.users(id),
            reviewed_at         TIMESTAMPTZ,
            UNIQUE (alias_barcode, canonical_candidate)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_merge_suggestions_status
            ON app.product_merge_suggestions (status, similarity_score DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_merge_suggestions_cluster
            ON app.product_merge_suggestions (cluster_key)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS app.idx_merge_suggestions_cluster")
    op.execute("DROP INDEX IF EXISTS app.idx_merge_suggestions_status")
    op.execute("DROP TABLE IF EXISTS app.product_merge_suggestions")
    op.execute("DROP INDEX IF EXISTS app.idx_product_aliases_canonical")
    op.execute("DROP TABLE IF EXISTS app.product_aliases")
