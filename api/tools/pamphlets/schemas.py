from datetime import date, datetime
from pydantic import BaseModel, model_validator


class PamphletItemCreate(BaseModel):
    barcode: str | None = None      # None for custom (non-catalog) products
    display_name: str | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    sort_order: int = 0
    image_url: str | None = None

    @model_validator(mode="after")
    def display_name_required_for_custom(self):
        if not self.barcode and not self.display_name:
            raise ValueError("display_name is required when barcode is not provided")
        return self


class PamphletItemUpdate(BaseModel):
    display_name: str | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    sort_order: int | None = None
    image_url: str | None = None


class PamphletItemResponse(BaseModel):
    id: str
    pamphlet_id: str
    barcode: str | None = None
    display_name: str | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    sort_order: int = 0
    image_url: str | None = None

    model_config = {"from_attributes": True}


class PamphletCreate(BaseModel):
    title: str
    template_type: str = "sale_offer"
    valid_from: date | None = None
    valid_until: date | None = None
    rows: int = 4
    cols: int = 5
    items: list[PamphletItemCreate] = []


class PamphletUpdate(BaseModel):
    title: str | None = None
    template_type: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_published: bool | None = None
    rows: int | None = None
    cols: int | None = None


class PamphletResponse(BaseModel):
    id: str
    title: str
    template_type: str
    created_at: datetime | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    is_published: bool
    rows: int = 4
    cols: int = 5
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
    rows: int = 4
    cols: int = 5
    item_count: int = 0

    model_config = {"from_attributes": True}
