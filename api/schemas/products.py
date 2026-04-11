from datetime import datetime
from pydantic import BaseModel


class ProductBase(BaseModel):
    canonical_name: str
    category: str | None = None
    subcategory: str | None = None
    brand: str | None = None
    unit_of_measure: str | None = None
    pack_size: float | None = None
    image_url: str | None = None
    hsn_code: str | None = None
    gst_rate_percent: float | None = None
    is_active: bool = True
    notes: str | None = None
    product_type: str | None = "retail"
    is_reviewed: bool = False
    size: str | None = None
    colour: str | None = None


class ProductUpdate(BaseModel):
    """All fields optional for PATCH."""
    canonical_name: str | None = None
    category: str | None = None
    subcategory: str | None = None
    brand: str | None = None
    unit_of_measure: str | None = None
    pack_size: float | None = None
    image_url: str | None = None
    hsn_code: str | None = None
    gst_rate_percent: float | None = None
    is_active: bool | None = None
    notes: str | None = None
    product_type: str | None = None
    is_reviewed: bool | None = None
    size: str | None = None
    colour: str | None = None


class ProductResponse(ProductBase):
    barcode: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProductSearchResult(BaseModel):
    """Lightweight model for search dropdowns (e.g. pamphlet builder)."""
    barcode: str
    canonical_name: str
    category: str | None = None
    mrp: float | None = None


class BulkCategorizeRequest(BaseModel):
    """Batch update category and/or product_type for multiple products."""
    barcodes: list[str]
    category: str | None = None
    product_type: str | None = None


class BulkCategorizeResponse(BaseModel):
    """Result of bulk categorize operation."""
    updated: int
    skipped: int  # barcodes not found in app.products
