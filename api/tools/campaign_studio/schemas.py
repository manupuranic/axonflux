from datetime import date, datetime
from typing import Any
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------

CAMPAIGN_TYPES = [
    "monsoon_sale", "festival_offer", "clearance", "health_campaign",
    "premium_products", "new_arrivals", "combo_offer", "seasonal_promotion",
    "store_announcement", "product_spotlight",
]

CAMPAIGN_OBJECTIVES = [
    "increase_sales", "move_inventory", "increase_awareness",
    "increase_margin", "promote_category",
]

CAMPAIGN_STATUSES = ["draft", "active", "archived"]


class CampaignCreate(BaseModel):
    title: str
    campaign_type: str | None = None
    objective: str | None = None
    audience: str | None = None
    theme_id: str | None = None
    channels: list[str] = []
    valid_from: date | None = None
    valid_until: date | None = None
    metadata: dict | None = None


class CampaignUpdate(BaseModel):
    title: str | None = None
    campaign_type: str | None = None
    objective: str | None = None
    audience: str | None = None
    theme_id: str | None = None
    channels: list[str] | None = None
    status: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    metadata: dict | None = None


class CampaignResponse(BaseModel):
    id: str
    title: str
    campaign_type: str | None
    objective: str | None
    audience: str | None
    theme_id: str | None
    channels: list[str]
    status: str
    created_at: datetime | None
    valid_from: date | None
    valid_until: date | None
    metadata: dict | None
    product_count: int = 0
    design_count: int = 0

    model_config = {"from_attributes": True}


class CampaignSummary(BaseModel):
    id: str
    title: str
    campaign_type: str | None
    objective: str | None
    channels: list[str]
    status: str
    created_at: datetime | None
    valid_from: date | None
    valid_until: date | None
    product_count: int = 0
    design_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Campaign Products
# ---------------------------------------------------------------------------

PRODUCT_PRIORITIES = ["hero", "feature", "supporting"]


class CampaignProductCreate(BaseModel):
    barcode: str | None = None
    display_name: str | None = None
    priority: str = "feature"
    role: str | None = None
    sort_order: int = 0
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    image_url: str | None = None
    category: str | None = None
    unit: str | None = None


class CampaignProductUpdate(BaseModel):
    display_name: str | None = None
    priority: str | None = None
    role: str | None = None
    sort_order: int | None = None
    offer_price: float | None = None
    original_price: float | None = None
    highlight_text: str | None = None
    image_url: str | None = None
    category: str | None = None
    unit: str | None = None


class CampaignProductResponse(BaseModel):
    id: str
    campaign_id: str
    barcode: str | None
    display_name: str | None
    priority: str
    role: str | None
    sort_order: int
    offer_price: float | None
    original_price: float | None
    highlight_text: str | None
    image_url: str | None
    category: str | None
    unit: str | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Campaign Designs
# ---------------------------------------------------------------------------

DESIGN_TYPES = [
    "pamphlet", "flyer", "poster", "wa_creative", "ig_post", "ig_story",
    "fb_post", "festival_banner", "product_spotlight", "announcement",
]

DESIGN_TARGETS = [
    "a4_landscape",   # 297×210mm
    "a4_portrait",    # 210×297mm
    "a5",             # 148×210mm
    "ig_post_1080",   # 1080×1080px
    "ig_story_1080",  # 1080×1920px
    "wa_1080",        # 1080×1080px
    "fb_1200x630",    # 1200×630px
    "custom",         # requires target_width_px + target_height_px
]

# Pixel dimensions for each target (None = mm-based, handled by renderer)
TARGET_DIMENSIONS_PX: dict[str, tuple[int, int] | None] = {
    "a4_landscape": None,
    "a4_portrait": None,
    "a5": None,
    "ig_post_1080": (1080, 1080),
    "ig_story_1080": (1080, 1920),
    "wa_1080": (1080, 1080),
    "fb_1200x630": (1200, 630),
    "custom": None,
}

DESIGN_STATUSES = ["draft", "approved", "exported"]


class CampaignDesignCreate(BaseModel):
    title: str = "Untitled Design"
    design_type: str
    target: str
    target_width_px: int | None = None
    target_height_px: int | None = None
    version_retention: int = 50


class CampaignDesignUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    dsl: dict | None = None
    theme: dict | None = None
    version_retention: int | None = None


class CampaignDesignResponse(BaseModel):
    id: str
    campaign_id: str
    title: str
    design_type: str
    target: str
    target_width_px: int | None
    target_height_px: int | None
    dsl: dict | None
    theme: dict | None
    current_version_id: str | None
    version_retention: int
    status: str
    created_at: datetime | None

    model_config = {"from_attributes": True}


class CampaignDesignSummary(BaseModel):
    id: str
    campaign_id: str
    title: str
    design_type: str
    target: str
    status: str
    created_at: datetime | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Design Versions
# ---------------------------------------------------------------------------

class DesignVersionResponse(BaseModel):
    id: str
    design_id: str
    edit_summary: str | None
    created_at: Any
    created_by: str | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Asset Library
# ---------------------------------------------------------------------------

ASSET_KINDS = ["logo", "sticker", "illustration", "background", "icon", "decoration", "photo"]


class AssetLibraryResponse(BaseModel):
    id: str
    kind: str
    url: str
    alt: str | None
    tags: list[str]
    metadata: dict | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Campaign Assets
# ---------------------------------------------------------------------------

class CampaignAssetCreate(BaseModel):
    asset_library_id: str | None = None
    kind: str
    url: str | None = None
    alt: str | None = None
    metadata: dict | None = None


class CampaignAssetResponse(BaseModel):
    id: str
    campaign_id: str
    asset_library_id: str | None
    kind: str
    url: str | None
    alt: str | None
    metadata: dict | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pamphlet export bridge
# ---------------------------------------------------------------------------

class ExportToPamphletRequest(BaseModel):
    design_id: str
    pamphlet_title: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class DesignChatRequest(BaseModel):
    message: str
    provider: str | None = None
    model: str | None = None


class DesignToolCallInfo(BaseModel):
    tool_name: str
    args: dict
    result: Any
    is_error: bool


class DesignChatResponse(BaseModel):
    assistant_text: str | None
    tool_calls: list[DesignToolCallInfo]
    version_id: str | None
    dsl: dict | None
    theme: dict | None
    cost_usd: float
    provider: str
    model: str
