import uuid

from sqlalchemy import Boolean, Column, Date, Integer, Numeric, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

from api.models.app import AppBase


class Campaign(AppBase):
    __tablename__ = "campaigns"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(Text, nullable=False)
    campaign_type = Column(Text, nullable=True)
    objective = Column(Text, nullable=True)
    audience = Column(Text, nullable=True)
    theme_id = Column(Text, nullable=True)
    channels = Column(ARRAY(Text), nullable=False, default=list)
    status = Column(Text, nullable=False, default="draft")
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    valid_from = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)


class CampaignProduct(AppBase):
    __tablename__ = "campaign_products"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("app.campaigns.id", ondelete="CASCADE"), nullable=False)
    barcode = Column(Text, nullable=True)
    display_name = Column(Text, nullable=True)
    priority = Column(Text, nullable=False, default="feature")
    role = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    offer_price = Column(Numeric, nullable=True)
    original_price = Column(Numeric, nullable=True)
    highlight_text = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    category = Column(Text, nullable=True)
    unit = Column(Text, nullable=True)


class CampaignDesign(AppBase):
    __tablename__ = "campaign_designs"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("app.campaigns.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(Text, nullable=False, default="Untitled Design")
    design_type = Column(Text, nullable=False)
    target = Column(Text, nullable=False)
    target_width_px = Column(Integer, nullable=True)
    target_height_px = Column(Integer, nullable=True)
    dsl = Column(JSONB, nullable=True)
    theme = Column(JSONB, nullable=True)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)
    version_retention = Column(Integer, nullable=False, default=50)
    status = Column(Text, nullable=False, default="draft")
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class CampaignDesignVersion(AppBase):
    __tablename__ = "campaign_design_versions"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    design_id = Column(UUID(as_uuid=True), ForeignKey("app.campaign_designs.id", ondelete="CASCADE"), nullable=False)
    dsl = Column(JSONB, nullable=False)
    theme = Column(JSONB, nullable=False)
    parent_version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    edit_summary = Column(Text, nullable=True)


class CampaignChatMessage(AppBase):
    __tablename__ = "campaign_chat_messages"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    design_id = Column(UUID(as_uuid=True), ForeignKey("app.campaign_designs.id", ondelete="CASCADE"), nullable=False)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=True)
    tool_call_name = Column(Text, nullable=True)
    tool_call_args = Column(JSONB, nullable=True)
    tool_call_result = Column(JSONB, nullable=True)
    version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    user_id = Column(UUID(as_uuid=True), nullable=True)
    provider = Column(Text, nullable=True)
    model = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    cost_usd = Column(Numeric(10, 6), nullable=True)


class AssetLibrary(AppBase):
    __tablename__ = "asset_library"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    kind = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    alt = Column(Text, nullable=True)
    tags = Column(ARRAY(Text), nullable=False, default=list)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class CampaignAsset(AppBase):
    __tablename__ = "campaign_assets"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("app.campaigns.id", ondelete="CASCADE"), nullable=False)
    asset_library_id = Column(UUID(as_uuid=True), nullable=True)
    kind = Column(Text, nullable=False)
    url = Column(Text, nullable=True)
    alt = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)
