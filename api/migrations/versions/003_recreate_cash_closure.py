"""Recreate cash_closure_records with full HOTO schema

Revision ID: 003
Revises: 002
Create Date: 2026-04-12

Replaces the old minimal schema (5 payment columns) with the full
Hand Over Take Over (HOTO) structure that mirrors the actual daily
staff workflow: inside/outside counter, dynamic rows via JSONB,
denomination counts, and computed reconciliation fields.
"""
from alembic import op

revision: str = "003"
down_revision: str = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the old table — it had no real production data yet
    op.execute("DROP TABLE IF EXISTS app.cash_closure_records")

    op.execute("""
        CREATE TABLE app.cash_closure_records (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            closure_date            DATE NOT NULL UNIQUE,
            submitted_by            UUID REFERENCES app.users(id),
            submitted_at            TIMESTAMPTZ,
            status                  TEXT NOT NULL DEFAULT 'draft',

            -- Opening
            opening_cash            NUMERIC,

            -- Inside Counter (income)
            net_sales               NUMERIC,
            sodexo_collection       NUMERIC,
            manual_billings         JSONB NOT NULL DEFAULT '[]',
            old_balance_collections JSONB NOT NULL DEFAULT '[]',
            distributor_expiry      NUMERIC,
            oil_crush               NUMERIC,
            other_income            NUMERIC,

            -- Outside Counter (digital collections)
            pluxee_amount           NUMERIC,
            paytm_amount            NUMERIC,
            phonepe_amount          NUMERIC,
            card_amount             NUMERIC,
            credits_given           JSONB NOT NULL DEFAULT '[]',
            returns_amount          NUMERIC,

            -- Outside Counter (expenses paid from drawer)
            expenses                JSONB NOT NULL DEFAULT '[]',

            -- Physical cash count
            physical_cash_counted   NUMERIC,

            -- Denomination counts
            denominations_opening   JSONB NOT NULL DEFAULT '{}',
            denominations_sales     JSONB NOT NULL DEFAULT '{}',

            -- Computed totals stored at submission time
            total_inside_counter    NUMERIC,
            total_outside_counter   NUMERIC,
            expected_cash           NUMERIC,
            difference_amount       NUMERIC,

            -- Admin verification
            notes                   TEXT,
            verified_by             UUID REFERENCES app.users(id),
            verified_at             TIMESTAMPTZ
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app.cash_closure_records")

    # Restore the old minimal schema
    op.execute("""
        CREATE TABLE app.cash_closure_records (
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
