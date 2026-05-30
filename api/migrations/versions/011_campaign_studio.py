"""011_campaign_studio

Revision ID: 011_campaign_studio
Revises: 010_pamphlet_items_category_unit
Create Date: 2026-05-30 00:00:00

New tables for Campaign Studio — coexists with pamphlet system, no breaking changes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID, ARRAY

revision = "011_campaign_studio"
down_revision = "010_pamphlet_items_category_unit"
branch_labels = None
depends_on = None


def upgrade():
    # -------------------------------------------------------------------------
    # app.campaigns — top-level campaign entity
    # -------------------------------------------------------------------------
    op.create_table(
        "campaigns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("campaign_type", sa.Text, nullable=True),
        sa.Column("objective", sa.Text, nullable=True),
        sa.Column("audience", sa.Text, nullable=True),
        sa.Column("theme_id", sa.Text, nullable=True),
        sa.Column("channels", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("valid_from", sa.Date, nullable=True),
        sa.Column("valid_until", sa.Date, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        schema="app",
    )
    op.create_index("ix_campaigns_created_at", "campaigns", ["created_at"], schema="app")
    op.create_index("ix_campaigns_org_status", "campaigns", ["org_id", "status"], schema="app")

    # -------------------------------------------------------------------------
    # app.campaign_products — product pool for a campaign
    # -------------------------------------------------------------------------
    op.create_table(
        "campaign_products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("campaign_id", UUID(as_uuid=True), nullable=False),
        sa.Column("barcode", sa.Text, nullable=True),
        sa.Column("display_name", sa.Text, nullable=True),
        sa.Column("priority", sa.Text, nullable=False, server_default="feature"),
        sa.Column("role", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("offer_price", sa.Numeric, nullable=True),
        sa.Column("original_price", sa.Numeric, nullable=True),
        sa.Column("highlight_text", sa.Text, nullable=True),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column("category", sa.Text, nullable=True),
        sa.Column("unit", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["app.campaigns.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index("ix_campaign_products_campaign", "campaign_products", ["campaign_id"], schema="app")

    # -------------------------------------------------------------------------
    # app.campaign_designs — one design = one render target (A4, IG post, etc.)
    # -------------------------------------------------------------------------
    op.create_table(
        "campaign_designs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("campaign_id", UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.Text, nullable=False, server_default="Untitled Design"),
        sa.Column("design_type", sa.Text, nullable=False),
        sa.Column("target", sa.Text, nullable=False),
        sa.Column("target_width_px", sa.Integer, nullable=True),
        sa.Column("target_height_px", sa.Integer, nullable=True),
        sa.Column("dsl", JSONB, nullable=True),
        sa.Column("theme", JSONB, nullable=True),
        sa.Column("current_version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("version_retention", sa.Integer, nullable=False, server_default="50"),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["campaign_id"], ["app.campaigns.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index("ix_campaign_designs_campaign", "campaign_designs", ["campaign_id"], schema="app")

    # -------------------------------------------------------------------------
    # app.campaign_design_versions — DSL snapshot ring-buffer per design
    # -------------------------------------------------------------------------
    op.create_table(
        "campaign_design_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("design_id", UUID(as_uuid=True), nullable=False),
        sa.Column("dsl", JSONB, nullable=False),
        sa.Column("theme", JSONB, nullable=False),
        sa.Column("parent_version_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("edit_summary", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(["design_id"], ["app.campaign_designs.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_campaign_design_versions_design_created",
        "campaign_design_versions",
        ["design_id", "created_at"],
        schema="app",
    )

    # -------------------------------------------------------------------------
    # app.campaign_chat_messages — persisted chat history per design
    # -------------------------------------------------------------------------
    op.create_table(
        "campaign_chat_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("design_id", UUID(as_uuid=True), nullable=False),
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
        sa.ForeignKeyConstraint(["design_id"], ["app.campaign_designs.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index(
        "ix_campaign_chat_design_created",
        "campaign_chat_messages",
        ["design_id", "created_at"],
        schema="app",
    )

    # -------------------------------------------------------------------------
    # app.asset_library — org-wide reusable assets
    # -------------------------------------------------------------------------
    op.create_table(
        "asset_library",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("alt", sa.Text, nullable=True),
        sa.Column("tags", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        schema="app",
    )
    op.create_index("ix_asset_library_org_kind", "asset_library", ["org_id", "kind"], schema="app")

    # -------------------------------------------------------------------------
    # app.campaign_assets — assets attached to a specific campaign
    # -------------------------------------------------------------------------
    op.create_table(
        "campaign_assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("campaign_id", UUID(as_uuid=True), nullable=False),
        sa.Column("asset_library_id", UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("alt", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["app.campaigns.id"], ondelete="CASCADE"),
        schema="app",
    )
    op.create_index("ix_campaign_assets_campaign", "campaign_assets", ["campaign_id"], schema="app")


def downgrade():
    op.drop_index("ix_campaign_assets_campaign", "campaign_assets", schema="app")
    op.drop_table("campaign_assets", schema="app")
    op.drop_index("ix_asset_library_org_kind", "asset_library", schema="app")
    op.drop_table("asset_library", schema="app")
    op.drop_index("ix_campaign_chat_design_created", "campaign_chat_messages", schema="app")
    op.drop_table("campaign_chat_messages", schema="app")
    op.drop_index("ix_campaign_design_versions_design_created", "campaign_design_versions", schema="app")
    op.drop_table("campaign_design_versions", schema="app")
    op.drop_index("ix_campaign_designs_campaign", "campaign_designs", schema="app")
    op.drop_table("campaign_designs", schema="app")
    op.drop_index("ix_campaign_products_campaign", "campaign_products", schema="app")
    op.drop_table("campaign_products", schema="app")
    op.drop_index("ix_campaigns_org_status", "campaigns", schema="app")
    op.drop_index("ix_campaigns_created_at", "campaigns", schema="app")
    op.drop_table("campaigns", schema="app")
