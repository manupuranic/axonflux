"""Create app schema and all application tables

Revision ID: 001
Revises:
Create Date: 2026-04-11

All DDL uses IF NOT EXISTS — safe to run against a live database.
Only the app.* schema is touched; raw.*, derived.*, and recon.* are untouched.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS app")

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.users (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username        TEXT NOT NULL UNIQUE,
            full_name       TEXT,
            hashed_password TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'staff',
            is_active       BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            last_login_at   TIMESTAMPTZ
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.products (
            barcode          TEXT PRIMARY KEY,
            canonical_name   TEXT NOT NULL,
            category         TEXT,
            subcategory      TEXT,
            brand            TEXT,
            unit_of_measure  TEXT,
            pack_size        NUMERIC,
            image_url        TEXT,
            hsn_code         TEXT,
            gst_rate_percent NUMERIC,
            is_active        BOOLEAN DEFAULT TRUE,
            notes            TEXT,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            updated_at       TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.pipeline_runs (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            triggered_by  UUID REFERENCES app.users(id),
            triggered_at  TIMESTAMPTZ DEFAULT NOW(),
            pipeline_type TEXT NOT NULL DEFAULT 'weekly_full',
            status        TEXT NOT NULL DEFAULT 'running',
            completed_at  TIMESTAMPTZ,
            log_output    TEXT,
            error_message TEXT
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.cash_closure_records (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            closure_date     DATE NOT NULL,
            submitted_by     UUID REFERENCES app.users(id),
            submitted_at     TIMESTAMPTZ DEFAULT NOW(),
            status           TEXT NOT NULL DEFAULT 'draft',
            physical_cash    NUMERIC,
            card_total       NUMERIC,
            upi_googlepay    NUMERIC,
            upi_phonepe      NUMERIC,
            upi_paytm        NUMERIC,
            system_cash      NUMERIC,
            system_card      NUMERIC,
            system_googlepay NUMERIC,
            system_phonepe   NUMERIC,
            system_paytm     NUMERIC,
            system_net_total NUMERIC,
            notes            TEXT,
            verified_by      UUID REFERENCES app.users(id),
            verified_at      TIMESTAMPTZ
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.pamphlets (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title         TEXT NOT NULL,
            template_type TEXT NOT NULL DEFAULT 'sale_offer',
            created_by    UUID REFERENCES app.users(id),
            created_at    TIMESTAMPTZ DEFAULT NOW(),
            valid_from    DATE,
            valid_until   DATE,
            is_published  BOOLEAN DEFAULT FALSE
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS app.pamphlet_items (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pamphlet_id    UUID NOT NULL REFERENCES app.pamphlets(id) ON DELETE CASCADE,
            barcode        TEXT NOT NULL,
            display_name   TEXT,
            offer_price    NUMERIC,
            original_price NUMERIC,
            highlight_text TEXT,
            sort_order     INTEGER DEFAULT 0
        )
    """)



def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app.pamphlet_items CASCADE")
    op.execute("DROP TABLE IF EXISTS app.pamphlets CASCADE")
    op.execute("DROP TABLE IF EXISTS app.cash_closure_records CASCADE")
    op.execute("DROP TABLE IF EXISTS app.pipeline_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS app.products CASCADE")
    op.execute("DROP TABLE IF EXISTS app.users CASCADE")
    # Intentionally NOT dropping the schema itself — could have other objects
