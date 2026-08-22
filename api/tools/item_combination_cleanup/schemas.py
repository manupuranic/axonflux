import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CleanupRunResponse(BaseModel):
    id: str
    status: str
    source_file_name: str
    sheet_name: str | None
    header_row: int | None
    row_count: int | None
    column_count: int | None
    headers: list[str] | None
    summary: dict[str, Any] | None = None
    validation_status: str | None
    error_message: str | None
    created_at: datetime | None
    has_output: bool
    has_approved_output: bool = False


class CleanupRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=False)

    item_id: str
    barcode: Any = None
    mrp: Any = None
    original_item_name: str | None = None
    proposed_item_name: str | None = None
    original_brand: str | None = None
    proposed_brand: str | None = None
    original_size: str | None = None
    proposed_size: str | None = None
    product_type: str
    classification_confidence: str | None = None
    review_status: str
    approval_status: str = "PENDING"
    supplier_name: str | None = None
    supplier_purchase_date: date | None = None
    supplier_purchase_id: str | None = None
    supplier_invoice_no: str | None = None
    supplier_source_file: str | None = None
    supplier_match_method: str | None = None
    classification_evidence: Any = None
    name_evidence: Any = None
    semantic_assessment: dict[str, Any] | None = None
    semantic_disagrees_with_packed_proposal: bool = False
    field_decisions: dict[str, dict[str, Any]] = Field(default_factory=dict)
    proposed_changes: dict[str, dict[str, str | None]] = Field(default_factory=dict)
    name_changed: bool
    brand_changed: bool
    size_changed: bool
    row_index: int


class CleanupRowListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[CleanupRowOut]
    stats: dict[str, Any] = Field(default_factory=dict)


class CleanupApprovalRequest(BaseModel):
    status: Literal["APPROVED", "REJECTED"]


class CleanupBulkApprovalRequest(BaseModel):
    type: str | None = None
    status: str | None = None
    confidence: str | None = None
    q: str | None = None
    brand_changed: bool | None = None
    name_changed: bool | None = None
    size_changed: bool | None = None


class CleanupBulkApprovalResponse(BaseModel):
    updated: int


class CleanupBulkDecisionRequest(BaseModel):
    status: Literal["APPROVED", "REJECTED"]
    item_ids: list[str] = Field(default_factory=list)
    type: str | None = None
    confidence: str | None = None
    supplier_match_method: str | None = None
    semantic_relationship: Literal["LIKELY_PACKED_VERSION", "LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT", "UNCERTAIN"] | None = None
    semantic_confidence: Literal["HIGH", "MEDIUM", "LOW"] | None = None
    semantic_disagreement: bool | None = None


class CleanupFieldDecisionRequest(BaseModel):
    decision: Literal["ACCEPTED", "REJECTED", "EDITED"]
    edited_value: str | None = None


class CleanupNameSuggestionDecisionRequest(BaseModel):
    decision: Literal["ACCEPTED", "REJECTED", "EDITED"]
    edited_value: str | None = None


class CleanupNameSuggestionBulkDecisionRequest(BaseModel):
    decision: Literal["ACCEPTED"]
    suggestion_ids: list[uuid.UUID] = Field(min_length=1)


class CleanupNameReviewResponse(BaseModel):
    items: list[dict[str, Any]]
    stats: dict[str, int]


class CleanupStaffExportRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list)
    packed_only: bool = False
