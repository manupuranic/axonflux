"""add isolated cleanup semantic assessments

Revision ID: 017_cleanup_semantic_assessments
Revises: 016_cleanup_row_approvals
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017_cleanup_semantic_assessments"
down_revision = "016_cleanup_row_approvals"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "item_combination_cleanup_semantic_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id_key", sa.Text(), nullable=False),
        sa.Column("relationship", sa.Text()), sa.Column("confidence", sa.Text()), sa.Column("reason", sa.Text()),
        sa.Column("signals_for_packed", postgresql.JSONB()), sa.Column("signals_against_packed", postgresql.JSONB()), sa.Column("identity_interpretations", postgresql.JSONB()),
        sa.Column("provider", sa.Text(), nullable=False), sa.Column("model", sa.Text(), nullable=False), sa.Column("prompt_version", sa.Text(), nullable=False),
        sa.Column("raw_response", postgresql.JSONB()), sa.Column("validation_status", sa.Text(), nullable=False), sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("run_id", "item_id_key", "provider", "model", "prompt_version", name="uq_cleanup_semantic_assessment_version"),
        schema="app",
    )
    op.create_index("ix_cleanup_semantic_run", "item_combination_cleanup_semantic_assessments", ["run_id"], schema="app")


def downgrade():
    op.drop_index("ix_cleanup_semantic_run", table_name="item_combination_cleanup_semantic_assessments", schema="app")
    op.drop_table("item_combination_cleanup_semantic_assessments", schema="app")
