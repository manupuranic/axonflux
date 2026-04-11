from datetime import date, datetime
from pydantic import BaseModel


class PamphletItemCreate(BaseModel):
    barcode: str
    display_name: str | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    sort_order: int = 0


class PamphletItemResponse(PamphletItemCreate):
    id: str
    pamphlet_id: str

    model_config = {"from_attributes": True}


class PamphletCreate(BaseModel):
    title: str
    template_type: str = "sale_offer"
    valid_from: date | None = None
    valid_until: date | None = None
    items: list[PamphletItemCreate] = []


class PamphletUpdate(BaseModel):
    title: str | None = None
    template_type: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_published: bool | None = None


class PamphletResponse(BaseModel):
    id: str
    title: str
    template_type: str
    created_at: datetime | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_published: bool
    items: list[PamphletItemResponse] = []

    model_config = {"from_attributes": True}


class PamphletSummary(BaseModel):
    """Lightweight listing model (no items)."""
    id: str
    title: str
    template_type: str
    valid_from: date | None = None
    valid_until: date | None = None
    is_published: bool
    item_count: int = 0

    model_config = {"from_attributes": True}
