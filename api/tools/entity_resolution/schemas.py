from datetime import datetime

from pydantic import BaseModel


class SuggestionItem(BaseModel):
    id: str
    alias_barcode: str
    canonical_candidate: str
    alias_name: str | None
    canonical_name: str | None
    similarity_score: float
    status: str


class SuggestionCluster(BaseModel):
    cluster_key: str
    canonical_candidate: str
    canonical_name: str | None
    members: list[SuggestionItem]
    min_score: float
    max_score: float


class ConfirmRequest(BaseModel):
    alias_barcode: str
    canonical_barcode: str
    notes: str | None = None


class RejectRequest(BaseModel):
    suggestion_id: str
    notes: str | None = None


class AliasResponse(BaseModel):
    alias_barcode: str
    canonical_barcode: str
    canonical_name: str | None
    similarity_score: float | None
    confirmed_at: datetime | None
    confirmed_by_username: str | None
    notes: str | None


class ConfirmResponse(BaseModel):
    alias: AliasResponse
    pipeline_rebuild_required: bool = True


class ProductDetail(BaseModel):
    barcode: str
    item_name: str | None
    brand: str | None
    mrp: float | None
    purchase_price: float | None
    rate: float | None
    size: str | None
    expiry_date: str | None
    hsn_code: str | None
    system_stock: float | None
    total_sales_qty: float | None
    last_sold: str | None
