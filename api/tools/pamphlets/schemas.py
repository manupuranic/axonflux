from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, model_validator


class PamphletItemCreate(BaseModel):
    barcode: str | None = None      # None for custom (non-catalog) products
    display_name: str | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    sort_order: int = 0
    image_url: str | None = None
    category: str | None = None
    unit: str | None = None

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
    category: str | None = None
    unit: str | None = None


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
    category: str | None = None
    unit: str | None = None

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
    template_dsl: dict | None = None
    theme: dict | None = None
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


class ChatRequest(BaseModel):
    message: str
    provider: str | None = None
    model: str | None = None


class ToolCallInfo(BaseModel):
    tool_name: str
    args: dict
    result: Any
    is_error: bool


class PendingItemChange(BaseModel):
    action: str  # "remove" | "update"
    item_id: str
    item_name: str
    fields: dict | None = None


class ApplyItemChangesRequest(BaseModel):
    changes: list[PendingItemChange]


class ChatResponse(BaseModel):
    assistant_text: str | None
    tool_calls: list[ToolCallInfo]
    version_id: str | None
    dsl: dict
    theme: dict
    cost_usd: float
    provider: str
    model: str
    pending_item_changes: list[PendingItemChange] = []


class VersionResponse(BaseModel):
    id: str
    pamphlet_id: str
    edit_summary: str | None
    created_at: Any
    created_by: str | None


class ModelInfo(BaseModel):
    provider: str
    model: str
    display_name: str
