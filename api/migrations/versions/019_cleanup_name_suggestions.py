"""add additive Phase 5 name suggestions"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "019_cleanup_name_suggestions"
down_revision = "018_cleanup_field_decisions"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "item_combination_cleanup_name_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id_key", sa.Text(), nullable=False),
        sa.Column("field_name", sa.Text(), nullable=False, server_default="name"),
        sa.Column("suggestion_source", sa.Text(), nullable=False),
        sa.Column("suggestion_version", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("base_value", sa.Text(), nullable=False),
        sa.Column("suggested_value", sa.Text(), nullable=False),
        sa.Column("transformations", postgresql.JSONB(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.users.id")),
        sa.UniqueConstraint("run_id", "item_id_key", "field_name", "suggestion_source", "suggestion_version", name="uq_cleanup_name_suggestion_version"),
        schema="app",
    )


def downgrade():
    op.drop_table("item_combination_cleanup_name_suggestions", schema="app")
