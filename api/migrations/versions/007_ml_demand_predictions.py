"""Add app.ml_demand_predictions table

Revision ID: 007
Revises: 006
Create Date: 2026-04-26

Stores quantile demand forecasts (P10/P50/P90) written by the batch inference
script. Lives in app.* so predictions survive pipeline rebuilds. Primary key is
(date, product_id) — one active prediction set per product per day.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS app.ml_demand_predictions (
            date            DATE    NOT NULL,
            product_id      TEXT    NOT NULL,
            p10             NUMERIC NOT NULL,
            p50             NUMERIC NOT NULL,
            p90             NUMERIC NOT NULL,
            model_name      TEXT    NOT NULL,
            model_version   TEXT    NOT NULL,
            predicted_at    TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (date, product_id)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ml_demand_product_date
        ON app.ml_demand_predictions (product_id, date)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ml_demand_date
        ON app.ml_demand_predictions (date)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app.ml_demand_predictions")
