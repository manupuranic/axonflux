from __future__ import annotations
import re
from typing import Literal, Optional, Union, Annotated, Any
from pydantic import BaseModel, Field, model_validator


_COLOR_TOKENS = Literal["primary","secondary","accent","bg","surface","text","text_muted","border","success","danger"]
_SPACING_TOKENS = Literal["none","xs","sm","md","lg","xl","2xl"]


class StyleOverrides(BaseModel):
    model_config = {"extra": "ignore"}

    font_size_token: Optional[Literal["xs","sm","md","lg","xl","2xl"]] = None
    font_size_px: Optional[int] = Field(None, ge=8, le=72)
    font_weight: Optional[int] = Field(None, description="400|600|700|900")
    color_token: Optional[_COLOR_TOKENS] = None
    color_hex: Optional[str] = None
    bg_color_token: Optional[_COLOR_TOKENS] = None
    bg_color_hex: Optional[str] = None
    text_align: Optional[Literal["left","center","right"]] = None
    padding_token: Optional[_SPACING_TOKENS] = None
    margin_token: Optional[_SPACING_TOKENS] = None
    text_transform: Optional[Literal["uppercase","lowercase","capitalize"]] = None
    opacity: Optional[float] = Field(None, ge=0.0, le=1.0)
    letter_spacing: Optional[str] = None
    line_height: Optional[str] = None
    border_radius_token: Optional[_SPACING_TOKENS] = None

    @model_validator(mode="after")
    def validate_hex(self):
        for field, val in [("color_hex", self.color_hex), ("bg_color_hex", self.bg_color_hex)]:
            if val and not re.match(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$", val):
                raise ValueError(f"{field} must be #rrggbb or #rrggbbaa, got: {val}")
        return self


class PageNode(BaseModel):
    type: Literal["page"]
    id: str
    width_mm: float = 297.0
    height_mm: float = 210.0
    padding: Literal["xs","sm","md","lg"] = "md"
    theme_id: str = "minimal_light"
    lang: Literal["en","hi","kn"] = "en"
    children: list[AnyNode] = Field(default_factory=list)


class SectionNode(BaseModel):
    type: Literal["section"]
    id: str
    layout: Literal["grid","flex","stack"]
    cols: Optional[int] = None
    rows: Optional[int] = None
    gap: Literal["none","xs","sm","md","lg","xl"] = "md"
    align: Literal["start","center","end","stretch"] = "start"
    children: list[AnyNode] = Field(default_factory=list)
    style_overrides: Optional[StyleOverrides] = None


class SlotNode(BaseModel):
    type: Literal["slot"]
    id: str
    span_cols: Optional[int] = None
    span_rows: Optional[int] = None
    align: Literal["start","center","end","stretch"] = "start"
    children: list[AnyNode] = Field(default_factory=list)
    style_overrides: Optional[StyleOverrides] = None


class ProductNode(BaseModel):
    type: Literal["product"]
    id: str
    item_id: str
    layout: Literal["card","list","banner"] = "card"
    show_image: bool = True
    show_mrp: bool = True
    show_offer: bool = True
    show_badge: bool = True
    image_position: Literal["top","left","bg"] = "top"
    lang: Literal["en","hi","kn"] = "en"
    style_overrides: Optional[StyleOverrides] = None


class TextNode(BaseModel):
    type: Literal["text"]
    id: str
    content: str
    variant: Literal["heading","subheading","body","price","caption"] = "body"
    align: Literal["left","center","right"] = "left"
    lang: Literal["en","hi","kn"] = "en"
    style_overrides: Optional[StyleOverrides] = None


class ImageNode(BaseModel):
    type: Literal["image"]
    id: str
    src: str
    alt: str = ""
    fit: Literal["cover","contain"] = "contain"
    radius: Literal["sm","md","lg","none"] = "none"
    style_overrides: Optional[StyleOverrides] = None


class DividerNode(BaseModel):
    type: Literal["divider"]
    id: str
    orientation: Literal["horizontal","vertical"] = "horizontal"
    thickness: int = 1
    color_token: Literal["primary","accent","border","text_muted"] = "border"
    style: Literal["solid","dashed","dotted"] = "solid"


class SpacerNode(BaseModel):
    type: Literal["spacer"]
    id: str
    size: Literal["xs","sm","md","lg","xl"]


class OfferBannerNode(BaseModel):
    type: Literal["offer_banner"]
    id: str
    headline: str
    subtext: Optional[str] = None
    accent_color_token: Optional[Literal["primary","accent","secondary","success","danger"]] = None
    shape: Literal["ribbon","badge","strip"] = "strip"
    style_overrides: Optional[StyleOverrides] = None


class LogoNode(BaseModel):
    type: Literal["logo"]
    id: str
    src: str
    height_px: int = 60
    position: Literal["left","center","right"] = "left"


class DecorationNode(BaseModel):
    type: Literal["decoration"]
    id: str
    kind: Literal["wave","dots","corners","border_frame"]
    color_token: Literal["primary","accent","secondary","text_muted"] = "accent"


class QrCodeNode(BaseModel):
    type: Literal["qr_code"]
    id: str
    url: str
    size_px: int = 96
    label: Optional[str] = None


class ContactStripNode(BaseModel):
    type: Literal["contact_strip"]
    id: str
    phone: Optional[str] = None
    address: Optional[str] = None
    map_url: Optional[str] = None
    wa_link: Optional[str] = None
    style_overrides: Optional[StyleOverrides] = None


class PriceCompareItem(BaseModel):
    label: str
    mrp: float
    offer: float
    badge: Optional[str] = None


class PriceCompareNode(BaseModel):
    type: Literal["price_compare"]
    id: str
    items: list[PriceCompareItem]
    layout: Literal["horizontal","vertical","podium"] = "horizontal"
    highlight_index: Optional[int] = None
    show_savings: bool = True


class CustomHtmlNode(BaseModel):
    type: Literal["custom_html"]
    id: str
    html: str
    scoped_css: Optional[str] = None


class RawSvgNode(BaseModel):
    type: Literal["raw_svg"]
    id: str
    svg: str


AnyNode = Annotated[
    Union[
        PageNode, SectionNode, SlotNode, ProductNode, TextNode,
        ImageNode, DividerNode, SpacerNode, OfferBannerNode, LogoNode,
        DecorationNode, QrCodeNode, ContactStripNode, PriceCompareNode,
        CustomHtmlNode, RawSvgNode,
    ],
    Field(discriminator="type"),
]

PageNode.model_rebuild()
SectionNode.model_rebuild()
SlotNode.model_rebuild()
