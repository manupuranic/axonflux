"""009_pamphlet_dsl

Revision ID: 009_pamphlet_dsl
Revises: 008
Create Date: 2026-05-24 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "009_pamphlet_dsl"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "pamphlets",
        sa.Column("template_dsl", JSONB, nullable=True),
        schema="app",
    )
    op.add_column(
        "pamphlets",
        sa.Column("theme", JSONB, nullable=True),
        schema="app",
    )
    op.add_column(
        "pamphlets",
        sa.Column("current_version_id", UUID(as_uuid=True), nullable=True),
        schema="app",
    )

    op.create_table(
        "pamphlet_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pamphlet_id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_dsl", JSONB, nullable=False),
        sa.Column("theme", JSONB, nullable=False),
        sa.Column("parent_version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("edit_summary", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(["pamphlet_id"], ["app.pamphlets.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_pamphlet_versions_pamphlet_created",
        "pamphlet_versions",
        ["pamphlet_id", "created_at"],
        schema="app",
    )

    op.create_table(
        "pamphlet_chat_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pamphlet_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("tool_call_name", sa.Text, nullable=True),
        sa.Column("tool_call_args", JSONB, nullable=True),
        sa.Column("tool_call_result", JSONB, nullable=True),
        sa.Column("version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.Text, nullable=True),
        sa.Column("model", sa.Text, nullable=True),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.ForeignKeyConstraint(["pamphlet_id"], ["app.pamphlets.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_pamphlet_chat_pamphlet_created",
        "pamphlet_chat_messages",
        ["pamphlet_id", "created_at"],
        schema="app",
    )

    op.alter_column("pamphlets", "rows", nullable=True, schema="app")
    op.alter_column("pamphlets", "cols", nullable=True, schema="app")


def downgrade():
    op.drop_index("ix_pamphlet_chat_pamphlet_created", "pamphlet_chat_messages", schema="app")
    op.drop_table("pamphlet_chat_messages", schema="app")
    op.drop_index("ix_pamphlet_versions_pamphlet_created", "pamphlet_versions", schema="app")
    op.drop_table("pamphlet_versions", schema="app")
    op.drop_column("pamphlets", "current_version_id", schema="app")
    op.drop_column("pamphlets", "theme", schema="app")
    op.drop_column("pamphlets", "template_dsl", schema="app")
    op.alter_column("pamphlets", "rows", nullable=False, schema="app")
    op.alter_column("pamphlets", "cols", nullable=False, schema="app")
