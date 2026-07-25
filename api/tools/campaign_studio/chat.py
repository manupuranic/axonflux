"""AI session builder for Campaign Studio design chat."""
from __future__ import annotations

from api.ai import ChatSession
from api.ai.config import get_default_provider, get_default_model
from api.agents.tools.pamphlet_dsl import build_dsl_tools
from api.tools.pamphlets.state import PamphletState
from api.tools.pamphlets.system_prompt import _summarize_dsl
from api.tools.pamphlets.themes import PRESET_IDS


def _build_products_table(products: list[dict]) -> str:
    """Compact product table for the system prompt.
    products: list of {id, display_name, offer_price, original_price, highlight_text, category}
    """
    if not products:
        return "No products in this campaign yet."
    lines = ["item_id | name | category | offer | mrp | badge"]
    lines.append("-" * 80)
    for p in products[:80]:  # cap at 80 to avoid bloating context
        item_id = str(p.get("id", "?"))
        name = (p.get("display_name") or "—")[:32]
        cat = (p.get("category") or "—")[:12]
        offer = f"₹{p['offer_price']:.0f}" if p.get("offer_price") else "—"
        mrp = f"₹{p['original_price']:.0f}" if p.get("original_price") else "—"
        badge = (p.get("highlight_text") or "—")[:20]
        lines.append(f"{item_id} | {name:<32} | {cat:<12} | {offer:>6} | {mrp:>6} | {badge}")
    if len(products) > 80:
        lines.append(f"... ({len(products) - 80} more products not shown)")
    return "\n".join(lines)


_CAMPAIGN_SYSTEM_PROMPT = f"""You are a design assistant for Campaign Studio — a multi-channel marketing platform for Puranic Health Mart.
You create and edit marketing designs (pamphlets, posters, WhatsApp creatives, social posts) by modifying a JSON DSL tree via tool calls.

## Rules
- NEVER narrate before tool calls. Call tools immediately.
- Batch all changes in ONE turn. Don't do one tool at a time.
- After all tools complete, write ONE short confirmation sentence.
- Available themes: {", ".join(PRESET_IDS)}

## Primary tool: apply_dsl_patch
Use `apply_dsl_patch(ops)` for almost everything. ops MUST be a JSON array (Python list).
ops supports: "insert", "remove", "move", "set", "style", "sort"

## Other tools (use when apply_dsl_patch is insufficient):
- get_layout() — returns full DSL + items (call only if you need deep node detail)
- set_theme(preset?, description?, overrides?, font_scale?) — apply or generate a theme
- set_grid(cols, rows?, image_width_pct?) — update the product grid dimensions
- style_region(region, **style_fields) — apply style to semantic regions (header/footer/all_headings)
- add_banner(headline, subtext?, position?, shape?, color_token?) — add offer banner
- edit_layout(operation, **kwargs) — insert/remove/move/sort nodes

## Creating a pamphlet from scratch
When given "create a pamphlet with X products":
1. Build a page with:
   - A flex section header (title on left, date/subtitle on right)
   - A grid section for products: cols=5, rows=4 → 20 per A4 page
   - An offer banner if appropriate
   - A contact strip at the bottom
2. Use apply_dsl_patch(ops=[...]) with ALL product nodes in a single call.
3. Product nodes: {{"type":"product","id":"prod-N","item_id":"<exact UUID from table below>",...}}

## Side-by-side layout
Wrap in a flex section:
apply_dsl_patch(ops=[
  {{"op":"insert","parent_id":"<page_id>","index":0,"node":{{"type":"section","id":"hdr","layout":"flex","gap":"sm","children":[]}}}},
  {{"op":"move","node_id":"<title_id>","new_parent_id":"hdr","index":0}},
  {{"op":"move","node_id":"<subtitle_id>","new_parent_id":"hdr","index":1}},
  {{"op":"style","node_id":"<subtitle_id>","style":{{"text_align":"right"}}}}
])

## style_overrides field names
- color_hex, bg_color_hex, color_token, bg_color_token
- font_size_px, font_weight, text_align, text_transform
- padding_token, margin_token, border_radius_token, opacity
Tokens: none|xs|sm|md|lg|xl (for spacing) | primary|secondary|accent|bg|surface|text|text_muted|border|success|danger (for colors)

## Product grid
- cols + rows → auto-paginates into A4 pages (cols×rows products per page)
- image_width_pct: 30-50 (% of card width for image)
- set_grid(cols=5, rows=4) → 20 products/A4 page
"""


def build_campaign_system_prompt(
    design_title: str,
    design_type: str,
    target: str,
    products: list[dict],
    dsl: dict | None = None,
) -> str:
    out = _CAMPAIGN_SYSTEM_PROMPT
    out += f"\n\n## Current design\nTitle: {design_title}\nType: {design_type}\nTarget: {target}"
    out += f"\n\nProducts in this campaign ({len(products)} total) — use item_id EXACTLY:\n"
    out += _build_products_table(products)
    if dsl:
        try:
            summary = _summarize_dsl(dsl)
        except Exception as exc:
            summary = f"(unavailable: {exc}. Call get_layout.)"
        out += "\n\n## Current DSL structure (use node IDs directly with apply_dsl_patch)\n"
        out += summary
    return out


def make_campaign_chat_session(
    dsl: dict,
    theme: dict,
    items: dict[str, dict],
    design_title: str,
    design_type: str,
    target: str,
    products: list[dict],
    history: list,
    provider: str | None = None,
    model: str | None = None,
    db=None,
    design_id: str = "",
) -> tuple[ChatSession, PamphletState]:
    from api.tools.campaign_studio.models import CampaignProduct
    state = PamphletState(
        dsl=dsl,
        theme=theme,
        items=items,
        db=db,
        pamphlet_id=design_id,  # field name doesn't matter — tools just use state.dsl
        product_model=CampaignProduct,  # price/name edits write CampaignProduct, not PamphletItem
    )
    tools = build_dsl_tools(state)
    session = ChatSession(
        provider=provider or get_default_provider(),
        model=model or get_default_model(),
        system_prompt=build_campaign_system_prompt(
            design_title=design_title,
            design_type=design_type,
            target=target,
            products=products,
            dsl=dsl,
        ),
        tools=tools,
        history=history,
    )
    return session, state
