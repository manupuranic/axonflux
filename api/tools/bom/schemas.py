from datetime import datetime
from pydantic import BaseModel


class BomSuggestion(BaseModel):
    id: str
    raw_barcode: str
    raw_name: str | None
    finished_barcode: str
    finished_name: str | None
    similarity_score: float
    status: str


class BomSuggestionGroup(BaseModel):
    raw_barcode: str
    raw_name: str | None
    suggestions: list[BomSuggestion]
    max_score: float


class ConfirmBomRequest(BaseModel):
    raw_barcode: str
    finished_barcode: str
    qty_per_unit: float
    notes: str | None = None
    suggestion_id: str | None = None


class RejectBomRequest(BaseModel):
    suggestion_id: str


class BomMapping(BaseModel):
    id: str
    raw_barcode: str
    raw_name: str | None
    finished_barcode: str
    finished_name: str | None
    qty_per_unit: float
    notes: str | None
    confirmed_at: datetime | None


class UpdateBomRequest(BaseModel):
    qty_per_unit: float | None = None
    notes: str | None = None


class ManualBomRequest(BaseModel):
    raw_barcode: str
    finished_barcode: str
    qty_per_unit: float
    notes: str | None = None
