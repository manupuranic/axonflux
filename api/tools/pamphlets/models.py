import uuid

from sqlalchemy import Boolean, Column, Date, Integer, Numeric, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB

from api.models.app import AppBase


class Pamphlet(AppBase):
    __tablename__ = "pamphlets"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(Text, nullable=False)
    template_type = Column(Text, nullable=False, default="sale_offer")
    created_by = Column(UUID(as_uuid=True))     # references app.users.id
    created_at = Column(TIMESTAMP(timezone=True))
    valid_from = Column(Date)
    valid_until = Column(Date)
    is_published = Column(Boolean, default=False)
    rows = Column(Integer, nullable=True, default=4)
    cols = Column(Integer, nullable=True, default=5)
    template_dsl = Column(JSONB, nullable=True)
    theme = Column(JSONB, nullable=True)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)


class PamphletItem(AppBase):
    __tablename__ = "pamphlet_items"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), nullable=False)  # FK to app.pamphlets.id
    barcode = Column(Text)                  # nullable — custom products have no barcode
    display_name = Column(Text)
    offer_price = Column(Numeric)
    original_price = Column(Numeric)
    highlight_text = Column(Text)
    sort_order = Column(Integer, default=0)
    image_url = Column(Text)


class PamphletVersion(AppBase):
    __tablename__ = "pamphlet_versions"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), ForeignKey("app.pamphlets.id", ondelete="CASCADE"), nullable=False)
    template_dsl = Column(JSONB, nullable=False)
    theme = Column(JSONB, nullable=False)
    parent_version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    edit_summary = Column(Text, nullable=True)


class PamphletChatMessage(AppBase):
    __tablename__ = "pamphlet_chat_messages"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), ForeignKey("app.pamphlets.id", ondelete="CASCADE"), nullable=False)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=True)
    tool_call_name = Column(Text, nullable=True)
    tool_call_args = Column(JSONB, nullable=True)
    tool_call_result = Column(JSONB, nullable=True)
    version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    provider = Column(Text, nullable=True)
    model = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    cost_usd = Column(Numeric(10, 6), nullable=True)
