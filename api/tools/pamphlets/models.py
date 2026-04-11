import uuid

from sqlalchemy import Boolean, Column, Date, Integer, Numeric, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

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


class PamphletItem(AppBase):
    __tablename__ = "pamphlet_items"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pamphlet_id = Column(UUID(as_uuid=True), nullable=False)  # FK to app.pamphlets.id
    barcode = Column(Text, nullable=False)
    display_name = Column(Text)
    offer_price = Column(Numeric)
    original_price = Column(Numeric)
    highlight_text = Column(Text)
    sort_order = Column(Integer, default=0)
