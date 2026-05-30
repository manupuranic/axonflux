from __future__ import annotations
from html import escape

from api.tools.pamphlets.render.primitives import (
    PageNode, SectionNode, SlotNode, ProductNode, TextNode, ImageNode,
    DividerNode, SpacerNode, OfferBannerNode, LogoNode, DecorationNode,
    QrCodeNode, ContactStripNode, PriceCompareNode, CustomHtmlNode, RawSvgNode,
)
from api.tools.pamphlets.themes import load_theme, apply_overrides

_SPACING = {"none": "0", "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px", "2xl": "64px"}
_FONT_URLS = {
    "hi": "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap",
    "kn": "https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;700&display=swap",
}
_VARIANT_STYLES = {
    "heading":    "font-size:2rem;font-weight:700;color:var(--primary);",
    "subheading": "font-size:1.25rem;font-weight:600;color:var(--secondary);",
    "body":       "font-size:0.875rem;color:var(--text);",
    "price":      "font-size:1.5rem;font-weight:700;color:var(--accent);",
    "caption":    "font-size:0.75rem;color:var(--text-muted);",
}


def _fmt_mm(v: float) -> str:
    """Format a mm dimension: drop the .0 suffix for whole numbers."""
    return f"{v:g}mm"


_TEXT_VARIANTS = {"heading", "subheading", "body", "price", "caption"}
_VALID_TYPES = {
    "page", "section", "slot", "product", "text", "image", "divider",
    "spacer", "offer_banner", "logo", "decoration", "qr_code",
    "contact_strip", "price_compare", "custom_html", "raw_svg",
}


_VALID_SHAPES = {"ribbon", "badge", "strip"}
_VALID_TEXT_VARIANTS = {"heading", "subheading", "body", "price", "caption"}
_VALID_SECTION_LAYOUTS = {"grid", "flex", "stack"}
_VALID_GAPS = {"none", "xs", "sm", "md", "lg", "xl"}


def _normalize_node(node: dict) -> dict:
    """Remap LLM-hallucinated enum values and node types to valid primitives."""
    t = node.get("type", "")
    if t in _TEXT_VARIANTS and t not in _VALID_TYPES:
        node = {**node, "type": "text", "variant": t}
    elif t not in _VALID_TYPES and t not in _TEXT_VARIANTS:
        node = {"type": "text", "id": node.get("id", "unknown"), "content": f"[{t}]", "variant": "caption"}

    t = node.get("type", "")
    if t == "text" and node.get("variant") not in _VALID_TEXT_VARIANTS:
        node = {**node, "variant": "body"}
    if t == "offer_banner" and node.get("shape") not in _VALID_SHAPES:
        node = {**node, "shape": "strip"}
    if t == "section":
        if node.get("layout") not in _VALID_SECTION_LAYOUTS:
            node = {**node, "layout": "grid"}
        if node.get("gap") not in _VALID_GAPS:
            node = {**node, "gap": "md"}

    children = node.get("children")
    if children:
        node = {**node, "children": [_normalize_node(c) for c in children]}
    return node


def render_pamphlet(dsl: dict, theme: dict, items_lookup: dict[str, dict]) -> str:
    dsl = _normalize_node(dsl)
    page = PageNode.model_validate(dsl)
    resolved_theme = _resolve_theme(theme if theme else {}, page.theme_id)
    css_vars = _theme_to_css_vars(resolved_theme)
    font_links = _collect_font_links(page)

    # Detect the paginated product grid: nodes BEFORE it render normally,
    # nodes AFTER it (banner, footer) get tucked INSIDE the last A4 page
    # so they don't spill onto an empty extra print page.
    children = page.children
    grid_idx = next(
        (i for i, c in enumerate(children)
         if getattr(c, "type", "") == "section"
         and getattr(c, "layout", "") == "grid"
         and getattr(c, "cols", None)
         and getattr(c, "rows", None)),
        None,
    )
    if grid_idx is None:
        body = _render_children(children, items_lookup)
    else:
        leading_html = _render_children(children[:grid_idx], items_lookup)
        trailing_html = _render_children(children[grid_idx + 1:], items_lookup)
        body = leading_html + _render_paginated_grid(
            children[grid_idx], items_lookup, trailing_html=trailing_html,
            page_height_mm=page.height_mm, page_padding=page.padding,
        )
    pad = _SPACING.get(page.padding, "16px")

    # Page-level style_overrides bg takes highest priority (set via update_node on page)
    page_so = page.style_overrides
    if page_so and page_so.bg_color_hex:
        bg_style = f"background: {page_so.bg_color_hex};"
    elif page_so and page_so.bg_color_token:
        bg_style = f"background: var(--{page_so.bg_color_token.replace('_','-')});"
    else:
        bg_gradient = resolved_theme.get("tokens", {}).get("decoration", {}).get("bg_gradient", "")
        if bg_gradient and bg_gradient.strip().lower() not in ("", "none", "null"):
            bg_style = f"background: {bg_gradient};"
        else:
            bg_style = "background: var(--bg);"

    w = _fmt_mm(page.width_mm)
    h = _fmt_mm(page.height_mm)

    return f"""<!DOCTYPE html>
<html lang="{page.lang}">
<head>
<meta charset="utf-8">
{font_links}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&display=swap" rel="stylesheet">
<style>
@page {{ size: {w} {h}; margin: 0; }}
:root {{{css_vars}}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
body{{width:{w};{bg_style}font-family:var(--font-body,Geist,sans-serif);color:var(--text);}}
.page-root{{width:100%;}}
.a4-page{{width:{w};height:{h};overflow:hidden;padding:{pad};break-after:page;margin-bottom:24px;outline:1px solid #e0e0e0;}}
.a4-page:last-child{{break-after:auto;margin-bottom:0;}}
.page-trailing{{margin-top:8px;display:flex;flex-direction:column;gap:4px;}}
.section-grid{{display:grid;}}
.section-flex{{display:flex;flex-direction:row;align-items:center;justify-content:space-between;}}
.section-stack{{display:flex;flex-direction:column;}}
.product-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:6px;display:flex;flex-direction:row;height:100%;overflow:hidden;min-height:0;gap:6px;font-size:var(--card-base,0.82rem);}}
.product-card .product-img-wrap{{width:var(--img-w,38%);flex-shrink:0;align-self:stretch;border-radius:4px;background:var(--border);overflow:hidden;}}
.product-card .product-img{{width:100%;height:100%;object-fit:cover;object-position:center top;}}
.product-card .product-info{{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}}
.product-card .product-name{{font-size:0.83em;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}}
.product-card .product-prices{{display:flex;gap:4px;align-items:baseline;margin-top:auto;flex-wrap:wrap;padding-top:4px;}}
.product-badge{{background:var(--accent);color:#fff;font-size:0.71em;padding:2px 4px;border-radius:99px;align-self:flex-start;flex-shrink:0;margin-bottom:2px;}}
.price-offer{{color:var(--accent);font-weight:700;font-size:1em;}}
.price-mrp{{color:var(--text-muted);font-size:0.91em;text-decoration:line-through;}}
.offer-banner-strip{{background:var(--accent);color:#fff;padding:12px 24px;text-align:center;border-radius:var(--radius-md,8px);}}
.offer-banner-ribbon{{background:var(--accent);color:#fff;padding:8px 32px;clip-path:polygon(0 0,100% 0,calc(100% - 16px) 50%,100% 100%,0 100%,16px 50%);text-align:center;}}
.offer-banner-badge{{background:var(--accent);color:#fff;border-radius:50%;width:120px;height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:auto;}}
.contact-strip{{display:flex;gap:16px;align-items:center;font-size:0.75rem;color:var(--text-muted);padding:8px;border-top:1px solid var(--border);}}
</style>
</head>
<body>
<div class="page-root">{body}</div>
</body>
</html>"""



def _resolve_theme(theme: dict, fallback_id: str) -> dict:
    preset_id = theme.get("preset") or theme.get("id") or fallback_id
    try:
        base = load_theme(preset_id)
    except KeyError:
        base = load_theme("minimal_light")
    overrides = theme.get("overrides", {})
    return apply_overrides(base, overrides) if overrides else base


def _theme_to_css_vars(theme: dict) -> str:
    tokens = theme.get("tokens", {})
    lines = []
    for k, v in tokens.get("colors", {}).items():
        lines.append(f"--{k.replace('_','-')}:{v};")
    for k, v in tokens.get("typography", {}).items():
        if k == "card_base_rem":
            lines.append(f"--card-base:{v}rem;")
        else:
            lines.append(f"--font-{k.replace('_','-')}:{v};")
    for k, v in tokens.get("radii", {}).items():
        lines.append(f"--radius-{k}:{v};")
    return "".join(lines)


def _collect_font_links(page: PageNode) -> str:
    langs = _collect_langs(page)
    return "\n".join(f'<link rel="stylesheet" href="{_FONT_URLS[l]}">' for l in langs if l in _FONT_URLS)


def _collect_langs(node) -> set[str]:
    langs: set[str] = set()
    if hasattr(node, "lang"):
        langs.add(node.lang)
    if hasattr(node, "children"):
        for c in node.children:
            langs |= _collect_langs(c)
    return langs


def _render_children(children: list, lookup: dict) -> str:
    return "".join(_render_node(c, lookup) for c in children)


def _style_overrides(so) -> str:
    if not so:
        return ""
    parts = []
    _SZ = {"none":"0","xs":"10px","sm":"12px","md":"14px","lg":"18px","xl":"22px","2xl":"28px"}
    _BR = {"none":"0","xs":"2px","sm":"4px","md":"8px","lg":"12px","xl":"16px","2xl":"24px"}
    if so.font_size_px:
        parts.append(f"font-size:{so.font_size_px}px;")
    if so.font_size_token:
        parts.append(f"font-size:{_SZ.get(so.font_size_token,'')};")
    if so.font_weight:
        parts.append(f"font-weight:{so.font_weight};")
    if so.color_hex:
        parts.append(f"color:{so.color_hex};")
    elif so.color_token:
        parts.append(f"color:var(--{so.color_token.replace('_','-')});")
    if so.bg_color_hex:
        parts.append(f"background:{so.bg_color_hex};")
    elif so.bg_color_token:
        parts.append(f"background:var(--{so.bg_color_token.replace('_','-')});")
    if so.text_align:
        parts.append(f"text-align:{so.text_align};")
    if so.padding_token:
        parts.append(f"padding:{_SPACING.get(so.padding_token,'8px')};")
    if so.margin_token:
        parts.append(f"margin:{_SPACING.get(so.margin_token,'8px')};")
    if so.text_transform:
        parts.append(f"text-transform:{so.text_transform};")
    if so.opacity is not None:
        parts.append(f"opacity:{so.opacity};")
    if so.letter_spacing:
        parts.append(f"letter-spacing:{so.letter_spacing};")
    if so.line_height:
        parts.append(f"line-height:{so.line_height};")
    if so.border_radius_token:
        parts.append(f"border-radius:{_BR.get(so.border_radius_token,'0')};")
    return "".join(parts)


def _render_node(node, lookup: dict) -> str:
    t = getattr(node, "type", "")
    if t == "section":      return _render_section(node, lookup)
    if t == "slot":         return _render_slot(node, lookup)
    if t == "product":      return _render_product(node, lookup)
    if t == "text":         return _render_text(node)
    if t == "image":        return _render_image(node)
    if t == "divider":      return _render_divider(node)
    if t == "spacer":       return _render_spacer(node)
    if t == "offer_banner": return _render_offer_banner(node)
    if t == "logo":         return _render_logo(node)
    if t == "decoration":   return _render_decoration(node)
    if t == "qr_code":      return _render_qr_code(node)
    if t == "contact_strip":  return _render_contact_strip(node)
    if t == "price_compare":  return _render_price_compare(node)
    if t == "custom_html":  return f'<div style="all:initial">{node.html}</div>'
    if t == "raw_svg":      return node.svg
    return ""


def _render_section(n: SectionNode, lookup: dict) -> str:
    # cols + rows → paginated pages with equal-height grid cells.
    # Page dimensions are not available here (we're deep in the node tree),
    # so use A4 landscape defaults — the correct path goes through render_pamphlet.
    if n.layout == "grid" and n.cols and n.rows:
        return _render_paginated_grid(n, lookup)
    cls = f"section-{n.layout}"
    extra = ""
    if n.layout == "grid" and n.cols:
        extra += f"grid-template-columns:repeat({n.cols},1fr);"
    gap = _SPACING.get(n.gap, "16px")
    extra += f"gap:{gap};"
    so = _style_overrides(n.style_overrides)
    if n.layout == "flex":
        # each child gets flex:1 so text-align:right inside a child pushes content to the right edge
        children_html = "".join(
            f'<div style="flex:1;min-width:0;">{_render_node(c, lookup)}</div>'
            for c in n.children
        )
        return f'<div class="{cls}" style="{extra}{so}">{children_html}</div>'
    return f'<div class="{cls}" style="{extra}{so}">{_render_children(n.children, lookup)}</div>'


def _node_has_content(node, lookup: dict) -> bool:
    """Return True if node will produce visible output (used to skip deleted-product slots)."""
    t = getattr(node, "type", "")
    if t == "product":
        return node.item_id in lookup
    if t == "slot":
        return any(_node_has_content(c, lookup) for c in node.children)
    return True


def _render_paginated_grid(
    n: SectionNode,
    lookup: dict,
    trailing_html: str = "",
    page_height_mm: float = 210.0,
    page_padding: str = "md",
) -> str:
    items_per_page = n.cols * n.rows
    gap = _SPACING.get(n.gap, "8px")
    gap_px = {"none": 0, "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 40}.get(n.gap, 8)

    full_grid_css = (
        f"grid-template-columns:repeat({n.cols},1fr);"
        f"grid-template-rows:repeat({n.rows},1fr);"
        f"gap:{gap};height:100%;"
    )
    # Last-page variant: fixed row height matches full-page row height so cards look identical.
    # Padding is applied on both sides, so doubled. Map spacing token → px.
    _PAD_PX = {"xs": 8, "sm": 16, "md": 32, "lg": 48}
    pad_total_px = _PAD_PX.get(page_padding, 32)
    h_mm = _fmt_mm(page_height_mm)
    row_height = f"calc(({h_mm} - {pad_total_px}px - {(n.rows - 1) * gap_px}px) / {n.rows})"
    partial_grid_css = (
        f"grid-template-columns:repeat({n.cols},1fr);"
        f"grid-auto-rows:{row_height};"
        f"gap:{gap};"
    )

    img_w = f"--img-w:{n.image_width_pct}%;" if n.image_width_pct else ""
    pages = []
    children = [c for c in n.children if _node_has_content(c, lookup)]
    chunks = [children[i : i + items_per_page] for i in range(0, max(len(children), 1), items_per_page)]

    for idx, chunk in enumerate(chunks):
        is_last_chunk = idx == len(chunks) - 1
        is_partial = len(chunk) < items_per_page
        grid_css = partial_grid_css if (is_last_chunk and is_partial) else full_grid_css
        cells = "".join(_render_node(c, lookup) for c in chunk)

        # Tuck trailing content (banners, footer) into the LAST A4 page so they
        # don't push themselves onto a fresh print page.
        # Partial last page → render after the grid (room available).
        # Full last page → flex layout so trailing sits at the very bottom and grid shrinks.
        suffix = ""
        page_style = img_w
        if is_last_chunk and trailing_html:
            suffix = f'<div class="page-trailing">{trailing_html}</div>'
            if not is_partial:
                # Full grid + trailing: switch to column flex so they coexist
                page_style = f"{img_w}display:flex;flex-direction:column;"
                grid_css += "flex:1;min-height:0;"

        pages.append(
            f'<div class="a4-page" style="{page_style}">'
            f'<div class="section-grid" style="{grid_css}">{cells}</div>'
            f'{suffix}'
            f'</div>'
        )
    return "".join(pages)


def _render_slot(n: SlotNode, lookup: dict) -> str:
    inner = _render_children(n.children, lookup)
    if not inner.strip():
        return ""  # empty slot after product removal — skip grid cell entirely
    style = "height:100%;"
    if n.span_cols:
        style += f"grid-column:span {n.span_cols};"
    if n.span_rows:
        style += f"grid-row:span {n.span_rows};"
    style += _style_overrides(n.style_overrides)
    return f'<div style="display:flex;align-items:stretch;{style}">{inner}</div>'


def _fmt_price(v) -> str:
    if v is None:
        return ""
    f = float(v)
    return str(int(f)) if f == int(f) else f"{f:.2f}"


def _fmt_save(offer, mrp) -> str:
    try:
        diff = float(mrp) - float(offer)
        return f"Save &#8377;{int(diff)}" if diff > 0 else ""
    except Exception:
        return ""


def _render_product(n: ProductNode, lookup: dict) -> str:
    item = lookup.get(n.item_id)
    if not item:
        return ""  # item deleted — slot will collapse this to nothing
    name = item.get("display_name", "Product")
    offer = item.get("offer_price")
    mrp = item.get("original_price")
    badge = item.get("highlight_text") or _fmt_save(offer, mrp)
    img_url = item.get("image_url", "")
    so = _style_overrides(n.style_overrides)

    if n.show_image and img_url:
        img_html = f'<div class="product-img-wrap"><img class="product-img" src="{escape(img_url)}" alt="{escape(name)}"></div>'
    else:
        img_html = '<div class="product-img-wrap"></div>'
    badge_html = f'<span class="product-badge">{badge}</span>' if (n.show_badge and badge) else ""
    mrp_html = f'<span class="price-mrp">&#8377;{_fmt_price(mrp)}</span>' if (n.show_mrp and mrp) else ""
    offer_html = f'<span class="price-offer">&#8377;{_fmt_price(offer)}</span>' if (n.show_offer and offer) else ""
    info_html = f'{badge_html}<span class="product-name">{escape(name)}</span><div class="product-prices">{offer_html}{mrp_html}</div>'
    return f'<div class="product-card" style="{so}">{img_html}<div class="product-info">{info_html}</div></div>'


def _render_text(n: TextNode) -> str:
    vs = _VARIANT_STYLES.get(n.variant, "")
    so = _style_overrides(n.style_overrides)
    return f'<p style="text-align:{n.align};{vs}{so}">{n.content}</p>'


def _render_image(n: ImageNode) -> str:
    r = {"sm":"4px","md":"8px","lg":"16px","none":"0"}.get(n.radius, "0")
    return f'<img src="{n.src}" alt="{n.alt}" style="object-fit:{n.fit};border-radius:{r};max-width:100%;">'


def _render_divider(n: DividerNode) -> str:
    if n.orientation == "horizontal":
        return f'<hr style="border:none;border-top:{n.thickness}px {n.style} var(--{n.color_token.replace("_","-")});margin:4px 0;">'
    return f'<div style="width:{n.thickness}px;border-left:{n.thickness}px {n.style} var(--{n.color_token.replace("_","-")});align-self:stretch;"></div>'


def _render_spacer(n: SpacerNode) -> str:
    h = _SPACING.get(n.size, "16px")
    return f'<div style="height:{h};flex-shrink:0;"></div>'


def _render_offer_banner(n: OfferBannerNode) -> str:
    cls = f"offer-banner-{n.shape}"
    accent = f"background:var(--{n.accent_color_token.replace('_','-')});" if n.accent_color_token else ""
    sub = f'<p style="font-size:0.75rem;opacity:0.9;">{n.subtext}</p>' if n.subtext else ""
    so = _style_overrides(n.style_overrides)
    # font_size_px on banner applies to headline text, not wrapper
    headline_font = f"font-size:{n.style_overrides.font_size_px}px;" if (n.style_overrides and n.style_overrides.font_size_px) else "font-size:1.1rem;"
    # padding_token on banner increases height
    pad = _SPACING.get(getattr(n.style_overrides, "padding_token", None) or "", "")
    pad_style = f"padding:{pad};" if pad else ""
    return f'<div class="{cls}" style="{accent}{pad_style}{so}"><strong style="{headline_font}">{n.headline}</strong>{sub}</div>'


def _render_logo(n: LogoNode) -> str:
    align = {"left":"flex-start","center":"center","right":"flex-end"}.get(n.position, "flex-start")
    return f'<div style="display:flex;justify-content:{align};"><img src="{n.src}" style="height:{n.height_px}px;object-fit:contain;" alt="logo"></div>'


def _render_decoration(n: DecorationNode) -> str:
    color = f"var(--{n.color_token.replace('_','-')})"
    if n.kind == "wave":
        return f'<div style="overflow:hidden;height:40px;"><svg viewBox="0 0 1200 40" preserveAspectRatio="none" style="width:100%;height:100%;"><path d="M0,20 C300,40 600,0 900,20 C1050,30 1150,10 1200,20 L1200,40 L0,40 Z" fill="{color}"/></svg></div>'
    if n.kind == "dots":
        return f'<div style="text-align:center;letter-spacing:8px;color:{color};font-size:1.2rem;">• • • • • • • • • •</div>'
    if n.kind == "corners":
        return f'<div style="position:relative;pointer-events:none;"><div style="position:absolute;top:0;left:0;width:24px;height:24px;border-top:3px solid {color};border-left:3px solid {color};"></div><div style="position:absolute;top:0;right:0;width:24px;height:24px;border-top:3px solid {color};border-right:3px solid {color};"></div></div>'
    if n.kind == "border_frame":
        return f'<div style="position:absolute;inset:8px;border:2px solid {color};border-radius:8px;pointer-events:none;"></div>'
    return ""


def _render_qr_code(n: QrCodeNode) -> str:
    label = f'<p style="font-size:0.6rem;text-align:center;color:var(--text-muted);">{n.label}</p>' if n.label else ""
    return f'<div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size={n.size_px}x{n.size_px}&data={n.url}" width="{n.size_px}" height="{n.size_px}" alt="QR">{label}</div>'


def _render_contact_strip(n: ContactStripNode) -> str:
    parts = []
    if n.phone:   parts.append(f'<span>Phone: {n.phone}</span>')
    if n.address: parts.append(f'<span>Address: {n.address}</span>')
    if n.wa_link: parts.append(f'<a href="{n.wa_link}" style="color:var(--success);">WhatsApp</a>')
    so = _style_overrides(n.style_overrides)
    return f'<div class="contact-strip" style="{so}">{"".join(parts)}</div>'


def _render_price_compare(n: PriceCompareNode) -> str:
    cards = []
    for i, item in enumerate(n.items):
        highlight = "border:2px solid var(--accent);" if i == n.highlight_index else "border:1px solid var(--border);"
        savings = f"<span style='font-size:0.65rem;color:var(--success);'>Save &#8377;{item.mrp - item.offer:.0f}</span>" if n.show_savings else ""
        badge = f"<span style='background:var(--accent);color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:4px;'>{item.badge}</span>" if item.badge else ""
        cards.append(f'<div style="padding:8px;border-radius:8px;text-align:center;{highlight}"><p style="font-size:0.75rem;font-weight:600;">{item.label}</p>{badge}<p style="color:var(--accent);font-weight:700;">&#8377;{item.offer}</p><p style="text-decoration:line-through;color:var(--text-muted);font-size:0.7rem;">&#8377;{item.mrp}</p>{savings}</div>')
    flex = "flex-direction:column;" if n.layout == "vertical" else ""
    return f'<div style="display:flex;{flex}gap:8px;justify-content:center;">{"".join(cards)}</div>'
