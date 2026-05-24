from __future__ import annotations
from api.tools.pamphlets.render.primitives import (
    PageNode, SectionNode, SlotNode, ProductNode, TextNode, ImageNode,
    DividerNode, SpacerNode, OfferBannerNode, LogoNode, DecorationNode,
    QrCodeNode, ContactStripNode, PriceCompareNode, CustomHtmlNode, RawSvgNode,
)
from api.tools.pamphlets.themes import load_theme, apply_overrides

_SPACING = {"xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "40px"}
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


def render_pamphlet(dsl: dict, theme: dict, items_lookup: dict[str, dict]) -> str:
    page = PageNode.model_validate(dsl)
    resolved_theme = _resolve_theme(theme if theme else {}, page.theme_id)
    css_vars = _theme_to_css_vars(resolved_theme)
    font_links = _collect_font_links(page)

    body = _render_children(page.children, items_lookup)
    pad = _SPACING.get(page.padding, "16px")
    bg_gradient = resolved_theme.get("tokens", {}).get("decoration", {}).get("bg_gradient", "")
    bg_style = f"background: {bg_gradient};" if bg_gradient else "background: var(--bg);"

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
body{{width:{w};min-height:{h};{bg_style}font-family:var(--font-body,Geist,sans-serif);color:var(--text);overflow:hidden;}}
.page-root{{width:100%;min-height:{h};padding:{pad};}}
.section-grid{{display:grid;}}
.section-flex{{display:flex;flex-wrap:wrap;}}
.section-stack{{display:flex;flex-direction:column;}}
.product-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:8px;display:flex;flex-direction:column;gap:4px;}}
.product-badge{{background:var(--accent);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:99px;align-self:flex-start;}}
.price-offer{{color:var(--accent);font-weight:700;}}
.price-mrp{{color:var(--text-muted);font-size:0.75rem;text-decoration:line-through;}}
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
    if so.font_size_px:
        parts.append(f"font-size:{so.font_size_px}px;")
    if so.font_size_token:
        sz = {"xs":"10px","sm":"12px","md":"14px","lg":"18px","xl":"22px","2xl":"28px"}.get(so.font_size_token,"")
        parts.append(f"font-size:{sz};")
    if so.font_weight:
        parts.append(f"font-weight:{'400' if so.font_weight=='regular' else '500' if so.font_weight=='medium' else '700'};")
    if so.color_hex:
        parts.append(f"color:{so.color_hex};")
    elif so.color_token:
        parts.append(f"color:var(--{so.color_token.replace('_','-')});")
    if so.text_align:
        parts.append(f"text-align:{so.text_align};")
    if so.padding_token:
        parts.append(f"padding:{_SPACING.get(so.padding_token,'8px')};")
    if so.margin_token:
        parts.append(f"margin:{_SPACING.get(so.margin_token,'8px')};")
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
    cls = f"section-{n.layout}"
    extra = ""
    if n.layout == "grid" and n.cols:
        extra += f"grid-template-columns:repeat({n.cols},1fr);"
    gap = _SPACING.get(n.gap, "16px")
    extra += f"gap:{gap};"
    so = _style_overrides(n.style_overrides)
    return f'<div class="{cls}" style="{extra}{so}">{_render_children(n.children, lookup)}</div>'


def _render_slot(n: SlotNode, lookup: dict) -> str:
    style = ""
    if n.span_cols:
        style += f"grid-column:span {n.span_cols};"
    if n.span_rows:
        style += f"grid-row:span {n.span_rows};"
    style += _style_overrides(n.style_overrides)
    return f'<div style="display:flex;align-items:{n.align};{style}">{_render_children(n.children, lookup)}</div>'


def _render_product(n: ProductNode, lookup: dict) -> str:
    item = lookup.get(n.item_id, {})
    name = item.get("display_name", "Product")
    offer = item.get("offer_price")
    mrp = item.get("original_price")
    badge = item.get("highlight_text", "")
    img_url = item.get("image_url", "")
    so = _style_overrides(n.style_overrides)

    img_html = f'<img src="{img_url}" style="width:100%;height:80px;object-fit:contain;" alt="{name}">' if (n.show_image and img_url) else ""
    badge_html = f'<span class="product-badge">{badge}</span>' if (n.show_badge and badge) else ""
    mrp_html = f'<span class="price-mrp">&#8377;{mrp}</span>' if (n.show_mrp and mrp) else ""
    offer_html = f'<span class="price-offer">&#8377;{offer}</span>' if (n.show_offer and offer) else ""
    return f'<div class="product-card" style="{so}">{img_html}{badge_html}<span style="font-size:0.8rem;font-weight:600;">{name}</span><div style="display:flex;gap:6px;align-items:baseline;">{offer_html}{mrp_html}</div></div>'


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
    return f'<div class="{cls}" style="{accent}{so}"><strong style="font-size:1.1rem;">{n.headline}</strong>{sub}</div>'


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
