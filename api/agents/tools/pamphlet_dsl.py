from __future__ import annotations
import copy
import json
import re
import uuid

from api.ai.tools import tool, Tool
from api.tools.pamphlets.state import PamphletState, _find_node
from api.tools.pamphlets.themes import PRESET_IDS


_BARE_KEY = re.compile(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:')


def _coerce_ops_list(ops) -> tuple[list | None, str | None]:
    """LLMs sometimes pass ops as a JSON string (occasionally with Python-style
    unquoted keys / single quotes). Normalize to a Python list."""
    if isinstance(ops, list):
        return ops, None
    if not isinstance(ops, str):
        return None, f"ops must be a list, got {type(ops).__name__}"

    raw = ops.strip()
    try:
        parsed = json.loads(raw)
    except Exception:
        # Try lenient repair: quote bare keys, convert single→double quotes
        repaired = _BARE_KEY.sub(r'\1"\2":', raw)
        repaired = repaired.replace("'", '"')
        try:
            parsed = json.loads(repaired)
        except Exception as exc:
            return None, f"could not parse ops string as JSON: {exc}"

    if not isinstance(parsed, list):
        return None, "ops string parsed but is not a list"
    return parsed, None


def _find_region_nodes(dsl: dict, region: str) -> list[dict]:
    """Resolve a semantic region name to a list of DSL nodes."""
    if region == "footer":
        contacts: list[dict] = []
        texts: list[dict] = []

        def walk(node: dict):
            t = node.get("type")
            if t == "contact_strip":
                contacts.append(node)
            elif t == "text":
                texts.append(node)
            for c in node.get("children", []):
                walk(c)

        walk(dsl)
        # contact_strip nodes are always the footer; otherwise take trailing text nodes
        if contacts:
            return contacts + texts[-2:] if texts else contacts
        return texts[-3:] if texts else []

    if region == "header":
        def find_first_text(node: dict) -> dict | None:
            if node.get("type") == "text":
                return node
            for c in node.get("children", []):
                r = find_first_text(c)
                if r:
                    return r
            return None

        n = find_first_text(dsl)
        return [n] if n else []

    if region == "all_text":
        out: list[dict] = []

        def walk(node: dict):
            if node.get("type") == "text":
                out.append(node)
            for c in node.get("children", []):
                walk(c)

        walk(dsl)
        return out

    if region == "all_headings":
        out: list[dict] = []

        def walk(node: dict):
            if node.get("type") == "text" and node.get("variant") in ("heading", "subheading"):
                out.append(node)
            for c in node.get("children", []):
                walk(c)

        walk(dsl)
        return out

    if region == "product_cards":
        # Sentinel — style_region handles this specially via CSS variable, not DSL nodes
        return [{"__product_cards_sentinel__": True}]

    return []


def build_dsl_tools(state: PamphletState) -> list[Tool]:

    @tool(
        description=(
            "Return the current DSL tree structure (node IDs, types, key fields) and all product items. "
            "ALWAYS call this first when you need node IDs before inserting, moving, or updating nodes."
        ),
        parameters={"type": "object", "properties": {}, "required": []},
    )
    def get_layout() -> dict:
        def _summarize(node: dict, depth: int = 0) -> dict:
            t = node.get("type", "?")
            s: dict = {"id": node.get("id"), "type": t}
            if t == "text":
                s["variant"] = node.get("variant")
                s["content"] = (node.get("content") or "")[:40]
            elif t == "section":
                s["layout"] = node.get("layout")
                s["cols"] = node.get("cols")
                s["rows"] = node.get("rows")
                s["children_count"] = len(node.get("children", []))
                if depth == 0 and node.get("children"):
                    ch = node["children"]
                    sample = ch[:2] + (ch[-1:] if len(ch) > 2 else [])
                    s["children_sample"] = [_summarize(c, depth + 1) for c in sample]
            elif t == "product":
                s["item_id"] = node.get("item_id")
            if depth < 2 and t not in ("section",) and node.get("children"):
                s["children"] = [_summarize(c, depth + 1) for c in node["children"]]
            return s

        return {
            "page_id": state.dsl.get("id"),
            "children": [_summarize(c) for c in state.dsl.get("children", [])],
            "items": [
                {"item_id": k, "name": v.get("display_name"), "offer_price": v.get("offer_price")}
                for k, v in state.items.items()
            ],
        }

    @tool(
        description=(
            "Structural tree operations: insert/remove/move/duplicate a node, or sort products.\n"
            "insert: parent_id, position (int), node (dict with type + fields).\n"
            "remove: node_id. move: node_id, new_parent_id, new_position. duplicate: node_id.\n"
            "sort: section_id, sort_by (price_asc|price_desc|name_asc|discount_pct_desc|category).\n"
            "Node type field constraints (use exact values or save will fail):\n"
            "  offer_banner: shape must be 'ribbon'|'badge'|'strip'  (NOT 'wave', 'bar', etc.)\n"
            "  section: layout must be 'grid'|'flex'|'stack'; gap must be 'none'|'xs'|'sm'|'md'|'lg'|'xl'\n"
            "  text: variant must be 'heading'|'subheading'|'body'|'price'|'caption'\n"
            "  image: fit must be 'cover'|'contain'; radius must be 'sm'|'md'|'lg'|'none'"
        ),
        parameters={
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["insert", "remove", "move", "duplicate", "sort"]},
                "node_id": {"type": "string"},
                "parent_id": {"type": "string"},
                "position": {"type": "integer"},
                "new_parent_id": {"type": "string"},
                "new_position": {"type": "integer"},
                "node": {"type": "object"},
                "section_id": {"type": "string"},
                "sort_by": {"type": "string", "enum": ["price_asc", "price_desc", "name_asc", "discount_pct_desc", "category"]},
            },
            "required": ["operation"],
        },
    )
    def edit_layout(
        operation: str,
        node_id: str | None = None,
        parent_id: str | None = None,
        position: int | None = None,
        new_parent_id: str | None = None,
        new_position: int | None = None,
        node: dict | None = None,
        section_id: str | None = None,
        sort_by: str | None = None,
    ) -> dict:
        if operation == "insert":
            if not parent_id or node is None:
                return {"error": "insert requires parent_id and node"}
            if "id" not in node:
                node["id"] = str(uuid.uuid4())[:8]
            parent, _, _ = _find_node(state.dsl, parent_id)
            if parent is None and state.dsl.get("id") == parent_id:
                parent = state.dsl
            if parent is None:
                return {"error": f"Parent {parent_id!r} not found"}
            children = parent.setdefault("children", [])
            pos = max(0, min(position or 0, len(children)))
            children.insert(pos, node)
            state.dirty = True
            return {"ok": True, "inserted_id": node["id"]}

        elif operation == "remove":
            if not node_id:
                return {"error": "remove requires node_id"}
            _, parent_children, idx = _find_node(state.dsl, node_id)
            if parent_children is None:
                return {"error": f"Node {node_id!r} not found"}
            parent_children.pop(idx)
            state.dirty = True
            return {"ok": True}

        elif operation == "move":
            if not node_id or not new_parent_id:
                return {"error": "move requires node_id and new_parent_id"}
            node_obj, parent_children, idx = _find_node(state.dsl, node_id)
            if node_obj is None:
                return {"error": f"Node {node_id!r} not found"}
            new_parent, _, _ = _find_node(state.dsl, new_parent_id)  # find FIRST
            if new_parent is None:
                return {"error": f"New parent {new_parent_id!r} not found"}
            parent_children.pop(idx)  # pop AFTER validating destination
            children = new_parent.setdefault("children", [])
            pos = max(0, min(new_position or 0, len(children)))
            children.insert(pos, node_obj)
            state.dirty = True
            return {"ok": True}

        elif operation == "duplicate":
            if not node_id:
                return {"error": "duplicate requires node_id"}
            node_obj, parent_children, idx = _find_node(state.dsl, node_id)
            if node_obj is None:
                return {"error": f"Node {node_id!r} not found"}
            clone = copy.deepcopy(node_obj)
            clone["id"] = str(uuid.uuid4())[:8]
            parent_children.insert(idx + 1, clone)
            state.dirty = True
            return {"ok": True, "new_id": clone["id"]}

        elif operation == "sort":
            sid = section_id
            if not sid:
                return {"error": "sort requires section_id"}
            section, _, _ = _find_node(state.dsl, sid)
            if section is None:
                return {"error": f"Section {sid!r} not found"}
            by = sort_by or "name_asc"
            product_nodes = [c for c in section.get("children", []) if c.get("type") == "product"]
            other_nodes = [c for c in section.get("children", []) if c.get("type") != "product"]

            def key_fn(n):
                item = state.items.get(n.get("item_id", ""), {})
                offer = float(item.get("offer_price") or 0)
                mrp = float(item.get("original_price") or 0)
                name = (item.get("display_name") or "").lower()
                disc = ((mrp - offer) / mrp) if mrp > 0 else 0
                if by == "price_asc":
                    return offer
                if by == "price_desc":
                    return -offer
                if by == "discount_pct_desc":
                    return -disc
                return name

            product_nodes.sort(key=key_fn)
            section["children"] = other_nodes + product_nodes
            state.dirty = True
            return {"ok": True}

        return {"error": f"Unknown operation: {operation!r}"}

    _STYLE_FIELDS = {
        "color_hex", "color_token", "font_size_px", "font_size_token",
        "font_weight", "text_align", "padding_token", "margin_token",
        "bg_color_hex", "bg_color_token", "border_radius_token",
        "letter_spacing", "line_height", "text_transform", "opacity",
    }
    _COLOR_TOKENS = ["primary", "secondary", "accent", "bg", "surface", "text", "text_muted", "danger", "success", "border"]
    _SPACING_TOKENS = ["none", "xs", "sm", "md", "lg", "xl", "2xl"]

    @tool(
        description=(
            "Update fields on a DSL node by ID.\n"
            "patch fields: content, variant, cols, rows, item_id, show_image, gap, layout, headline, subtext, phone, address.\n"
            "style_overrides EXACT fields (no CSS names — use these exactly):\n"
            "  color_hex: '#RRGGBB'  — text color as hex\n"
            f"  color_token: one of {_COLOR_TOKENS}  — theme-relative text color\n"
            f"  bg_color_token: one of {_COLOR_TOKENS}  — background color\n"
            "  bg_color_hex: '#RRGGBB'  — background color as hex\n"
            "  font_size_px: number  — e.g. 24\n"
            "  font_weight: 400|600|700|900\n"
            "  text_align: 'left'|'center'|'right'\n"
            f"  margin_token: one of {_SPACING_TOKENS}  — uniform margin (NOT margin_left/margin_right)\n"
            f"  padding_token: one of {_SPACING_TOKENS}  — uniform padding\n"
            "  text_transform: 'uppercase'|'lowercase'|'capitalize'\n"
            "Example: update_node(id, {style_overrides:{color_token:'danger', font_weight:700}})\n"
            "WARNING: margin_left, margin_right, color, background are NOT valid — use the fields above."
        ),
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string"},
                "patch": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string"},
                        "variant": {"type": "string", "enum": ["heading", "subheading", "body", "price", "caption"]},
                        "cols": {"type": "integer"},
                        "rows": {"type": "integer"},
                        "gap": {"type": "string"},
                        "layout": {"type": "string"},
                        "show_image": {"type": "boolean"},
                        "style_overrides": {
                            "type": "object",
                            "properties": {
                                "color_hex": {"type": "string"},
                                "color_token": {"type": "string", "enum": _COLOR_TOKENS},
                                "bg_color_hex": {"type": "string"},
                                "bg_color_token": {"type": "string", "enum": _COLOR_TOKENS},
                                "font_size_px": {"type": "number"},
                                "font_weight": {"type": "integer", "enum": [400, 600, 700, 900]},
                                "text_align": {"type": "string", "enum": ["left", "center", "right"]},
                                "margin_token": {"type": "string", "enum": _SPACING_TOKENS},
                                "padding_token": {"type": "string", "enum": _SPACING_TOKENS},
                                "text_transform": {"type": "string", "enum": ["uppercase", "lowercase", "capitalize"]},
                                "opacity": {"type": "number"},
                                "letter_spacing": {"type": "string"},
                                "line_height": {"type": "string"},
                                "border_radius_token": {"type": "string", "enum": _SPACING_TOKENS},
                                "font_size_token": {"type": "string"},
                            },
                            "additionalProperties": False,
                        },
                    },
                },
            },
            "required": ["node_id", "patch"],
        },
    )
    def update_node(node_id: str, patch: dict) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None and state.dsl.get("id") == node_id:
            node = state.dsl
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        if "style_overrides" in patch:
            unknown = set(patch["style_overrides"].keys()) - _STYLE_FIELDS
            if unknown:
                return {
                    "error": f"Unknown style_overrides fields: {sorted(unknown)}. "
                             f"Valid fields: {sorted(_STYLE_FIELDS)}. "
                             "Use color_token (not 'color'), margin_token (not 'margin_left'/'margin_right')."
                }
        node.update(patch)
        state.dirty = True
        return {"ok": True}

    @tool(
        description=(
            "Batch-update product item data stored in the DB: display_name, offer_price, "
            "original_price, highlight_text. Optionally sort all products in the pamphlet."
        ),
        parameters={
            "type": "object",
            "properties": {
                "updates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_id": {"type": "string"},
                            "display_name": {"type": "string"},
                            "offer_price": {"type": "number"},
                            "original_price": {"type": "number"},
                            "highlight_text": {"type": "string"},
                        },
                        "required": ["item_id"],
                    },
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["price_asc", "price_desc", "name_asc", "discount_pct_desc", "category"],
                },
            },
            "required": ["updates"],
        },
    )
    def update_products(updates: list, sort_by: str | None = None) -> dict:
        if not state.db or not state.pamphlet_id:
            return {"error": "DB not available"}
        from api.tools.pamphlets.models import PamphletItem
        changed = 0
        for u in updates:
            item = state.db.query(PamphletItem).filter(PamphletItem.id == u["item_id"]).first()
            if not item:
                continue
            for field in ("display_name", "offer_price", "original_price", "highlight_text"):
                if field in u:
                    setattr(item, field, u[field])
            state.items[u["item_id"]] = {
                **state.items.get(u["item_id"], {}),
                **{f: u[f] for f in ("display_name", "offer_price", "original_price", "highlight_text") if f in u},
            }
            changed += 1
        state.dirty = True
        return {"updated": changed}

    @tool(
        description=(
            "Apply a theme to the pamphlet. Provide one or more of: "
            "preset (named theme), "
            "description (text like 'dark blue moody' — generates theme via AI), "
            "overrides (token overrides: {colors:{primary:'#hex'}, typography:{...}}), "
            "font_scale ({all|headings|prices|body: delta, e.g. 0.1 = 10% bigger})."
        ),
        parameters={
            "type": "object",
            "properties": {
                "preset": {"type": "string", "enum": PRESET_IDS},
                "description": {"type": "string"},
                "overrides": {"type": "object"},
                "font_scale": {"type": "object"},
            },
            "required": [],
        },
    )
    def set_theme(
        preset: str | None = None,
        description: str | None = None,
        overrides: dict | None = None,
        font_scale: dict | None = None,
    ) -> dict:
        if description:
            import json
            from api.ai import ChatSession
            from api.ai.config import get_default_provider

            _CHEAP = {
                "anthropic": "claude-haiku-4-5-20251001",
                "openrouter": "anthropic/claude-haiku-4-5-20251001",
                "openai": "gpt-4o-mini",
            }
            provider = get_default_provider()
            model = _CHEAP.get(provider, "anthropic/claude-haiku-4-5-20251001")
            prompt = (
                f'Generate a retail pamphlet color theme for: "{description}"\n'
                'Return ONLY valid JSON (no markdown):\n'
                '{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","bg":"#hex","surface":"#hex",'
                '"text":"#hex","text_muted":"#hex","border":"#hex","success":"#hex","danger":"#hex"},'
                '"decoration":{"bg_gradient":"linear-gradient(...)"}}'
            )
            try:
                sess = ChatSession(
                    provider=provider, model=model,
                    system_prompt="You are a color theme generator for retail pamphlets. Return only JSON.",
                    tools=[], history=[],
                )
                turn = sess.send(prompt)
                raw = (turn.assistant_text or "").strip().strip("```json").strip("```").strip()
                generated = json.loads(raw)
                state.theme = {"preset": "minimal_light", "overrides": generated}
                state.dsl["theme_id"] = "minimal_light"
                state.dirty = True
                return {"ok": True, "generated": generated}
            except Exception as exc:
                return {"error": f"Theme generation failed: {exc}. Try using preset= instead."}

        if preset:
            if preset not in PRESET_IDS:
                return {"error": f"Unknown preset {preset!r}. Valid presets: {PRESET_IDS}"}
            state.theme = {"preset": preset}
            state.dsl["theme_id"] = preset
            state.dirty = True

        if overrides:
            for section, tokens in overrides.items():
                state.theme.setdefault("overrides", {}).setdefault(section, {}).update(tokens)
            # Auto-clear bg_gradient when bg color is explicitly overridden —
            # gradient always wins over colors.bg if left intact
            if "bg" in overrides.get("colors", {}):
                state.theme.setdefault("overrides", {}).setdefault("decoration", {})["bg_gradient"] = "none"
            state.dirty = True

        if font_scale:
            state.theme.setdefault("font_scale", {}).update(font_scale)
            state.dirty = True

        return {"ok": True, "theme": state.theme.get("preset")}

    @tool(
        description=(
            "Ask the user a question when it cannot be resolved automatically — for clarification "
            "or to present options (e.g. title suggestions). "
            "Do NOT use this to ask for node IDs — call get_layout instead."
        ),
        parameters={
            "type": "object",
            "properties": {"question": {"type": "string"}},
            "required": ["question"],
        },
    )
    def ask_user(question: str) -> dict:
        return {"ask": question}

    @tool(
        description=(
            "Apply a style to a semantic REGION in one call. NO get_layout needed.\n"
            "region: 'footer' (contact_strip + bottom text), 'header' (first text/heading), "
            "'all_text' (every text node), 'all_headings' (text variant=heading|subheading), "
            "'product_cards' (product name/badge/price fonts — uses CSS variable, font_size_px only).\n"
            "Pass any style field(s) to apply. Existing style_overrides are merged, not replaced.\n"
            "Use for: 'make footer bigger', 'header in red', 'all prices bold', 'larger contact text', "
            "'bigger product names'."
        ),
        parameters={
            "type": "object",
            "properties": {
                "region": {"type": "string", "enum": ["footer", "header", "all_text", "all_headings", "product_cards"]},
                "font_size_px": {"type": "integer", "minimum": 8, "maximum": 72},
                "font_weight": {"type": "integer", "enum": [400, 600, 700, 900]},
                "color_hex": {"type": "string"},
                "color_token": {"type": "string", "enum": _COLOR_TOKENS},
                "bg_color_hex": {"type": "string"},
                "bg_color_token": {"type": "string", "enum": _COLOR_TOKENS},
                "text_align": {"type": "string", "enum": ["left", "center", "right"]},
                "text_transform": {"type": "string", "enum": ["uppercase", "lowercase", "capitalize"]},
                "padding_token": {"type": "string", "enum": _SPACING_TOKENS},
                "margin_token": {"type": "string", "enum": _SPACING_TOKENS},
            },
            "required": ["region"],
        },
    )
    def style_region(
        region: str,
        font_size_px: int | None = None,
        font_weight: int | None = None,
        color_hex: str | None = None,
        color_token: str | None = None,
        bg_color_hex: str | None = None,
        bg_color_token: str | None = None,
        text_align: str | None = None,
        text_transform: str | None = None,
        padding_token: str | None = None,
        margin_token: str | None = None,
    ) -> dict:
        overrides = {
            k: v for k, v in {
                "font_size_px": font_size_px,
                "font_weight": font_weight,
                "color_hex": color_hex,
                "color_token": color_token,
                "bg_color_hex": bg_color_hex,
                "bg_color_token": bg_color_token,
                "text_align": text_align,
                "text_transform": text_transform,
                "padding_token": padding_token,
                "margin_token": margin_token,
            }.items() if v is not None
        }
        if not overrides:
            return {"error": "No style properties given. Pass font_size_px, color_hex, etc."}

        # product_cards region: map font_size_px → CSS variable via theme override
        if region == "product_cards":
            if font_size_px is None:
                return {"error": "product_cards region only supports font_size_px"}
            card_base_rem = round(font_size_px / 16, 3)
            state.theme.setdefault("overrides", {}).setdefault("typography", {})["card_base_rem"] = card_base_rem
            state.dirty = True
            return {"ok": True, "region": "product_cards", "card_base_rem": card_base_rem, "font_size_px": font_size_px}

        targets = _find_region_nodes(state.dsl, region)
        if not targets:
            return {"error": f"No nodes found for region {region!r}"}

        # Filter out any sentinels (shouldn't happen for other regions but guard anyway)
        real_targets = [n for n in targets if not n.get("__product_cards_sentinel__")]
        for node in real_targets:
            existing = node.get("style_overrides") or {}
            node["style_overrides"] = {**existing, **overrides}
        state.dirty = True
        return {
            "ok": True,
            "region": region,
            "nodes_updated": len(real_targets),
            "node_ids": [n.get("id") for n in real_targets],
            "applied": overrides,
        }

    @tool(
        description=(
            "Change the product grid columns, rows, and/or image width. "
            "Auto-discovers the product grid section — no get_layout call needed. "
            "cols: cards per row. rows: rows per A4 page. "
            "image_width_pct: width of the image column inside each card (default 38, range 20–60)."
        ),
        parameters={
            "type": "object",
            "properties": {
                "cols": {"type": "integer", "minimum": 1, "maximum": 8},
                "rows": {"type": "integer", "minimum": 1, "maximum": 8},
                "image_width_pct": {"type": "integer", "minimum": 20, "maximum": 60},
            },
            "required": [],
        },
    )
    def set_grid(
        cols: int | None = None,
        rows: int | None = None,
        image_width_pct: int | None = None,
    ) -> dict:
        def _find_grid(node: dict) -> dict | None:
            if (
                node.get("type") == "section"
                and node.get("layout") == "grid"
                and node.get("cols")
                and node.get("rows")
            ):
                return node
            for c in node.get("children", []):
                r = _find_grid(c)
                if r:
                    return r
            return None

        section = _find_grid(state.dsl)
        if section is None:
            return {"error": "No product grid section found"}
        if cols is not None:
            section["cols"] = cols
        if rows is not None:
            section["rows"] = rows
        if image_width_pct is not None:
            section["image_width_pct"] = image_width_pct
        state.dirty = True
        return {
            "ok": True,
            "section_id": section["id"],
            "cols": section["cols"],
            "rows": section["rows"],
            "image_width_pct": section.get("image_width_pct", 38),
        }

    @tool(
        description=(
            "Insert an offer banner in ONE call. NO get_layout needed.\n"
            "position: 'top' (very first element) | 'bottom' (above the footer/contact_strip, ideal for "
            "'above the footer' or 'on the last page'). "
            "shape: 'ribbon' | 'badge' | 'strip'. "
            "color_token: 'primary' | 'accent' | 'secondary' | 'success' | 'danger'."
        ),
        parameters={
            "type": "object",
            "properties": {
                "headline": {"type": "string"},
                "subtext": {"type": "string"},
                "position": {"type": "string", "enum": ["top", "bottom"]},
                "shape": {"type": "string", "enum": ["ribbon", "badge", "strip"]},
                "color_token": {
                    "type": "string",
                    "enum": ["primary", "accent", "secondary", "success", "danger"],
                },
            },
            "required": ["headline", "position"],
        },
    )
    def add_banner(
        headline: str,
        position: str,
        subtext: str | None = None,
        shape: str = "strip",
        color_token: str = "accent",
    ) -> dict:
        banner: dict = {
            "type": "offer_banner",
            "id": str(uuid.uuid4())[:8],
            "headline": headline,
            "shape": shape,
            "accent_color_token": color_token,
        }
        if subtext:
            banner["subtext"] = subtext

        page = state.dsl
        children = page.setdefault("children", [])
        if position == "top":
            insert_idx = 0
        else:
            # bottom = above the footer. Footer is usually contact_strip OR the LAST
            # text/section node in the page. Detect:
            insert_idx = None
            for i, c in enumerate(children):
                if c.get("type") == "contact_strip":
                    insert_idx = i
                    break
            if insert_idx is None:
                # No contact_strip → assume last child is footer, insert before it
                insert_idx = max(0, len(children) - 1)
        children.insert(insert_idx, banner)

        state.dirty = True
        return {"ok": True, "banner_id": banner["id"], "position": position, "inserted_at": insert_idx}

    @tool(
        description=(
            "UNIVERSAL DSL editor. Apply any number of operations in ONE call. "
            "Use this for everything (color, layout, insert, delete, move, style). "
            "Prefer this over individual update_node/edit_layout chains.\n\n"
            "Each op is a dict. Supported ops:\n"
            "  {op:'set', node_id:'<id>', field:'<name>', value:<any>}  "
            "— set any field on a node (cols, rows, content, headline, layout, gap, etc.)\n"
            "  {op:'style', node_id:'<id>', style:{font_size_px:18, color_hex:'#f00', ...}}  "
            "— merge into node.style_overrides (does NOT replace existing keys)\n"
            "  {op:'insert', parent_id:'<id>', index:<int>, node:{type:'...', ...}}  "
            "— insert a new node; id auto-generated if missing\n"
            "  {op:'remove', node_id:'<id>'}  — delete a node\n"
            "  {op:'move', node_id:'<id>', new_parent_id:'<id>', index:<int>}  — relocate a node\n\n"
            "Special parent IDs: use the page_id for the root. "
            "Ops execute in order; if one fails, remaining ops still run and per-op results are returned."
        ),
        parameters={
            "type": "object",
            "properties": {
                "ops": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "op": {"type": "string", "enum": ["set", "style", "insert", "remove", "move"]},
                            "node_id": {"type": "string"},
                            "parent_id": {"type": "string"},
                            "new_parent_id": {"type": "string"},
                            "index": {"type": "integer"},
                            "field": {"type": "string"},
                            "style": {"type": "object"},
                            "node": {"type": "object"},
                        },
                        "required": ["op"],
                        "additionalProperties": True,
                    },
                },
            },
            "required": ["ops"],
        },
    )
    def apply_dsl_patch(ops) -> dict:
        ops, err = _coerce_ops_list(ops)
        if err:
            return {"error": err, "hint": "ops must be a JSON array of op dicts: [{\"op\":\"set\",\"node_id\":\"...\",\"field\":\"...\",\"value\":...}]"}
        results: list[dict] = []
        any_change = False

        def resolve(nid: str | None) -> dict | None:
            if not nid:
                return None
            if state.dsl.get("id") == nid:
                return state.dsl
            node, _, _ = _find_node(state.dsl, nid)
            return node

        for i, op_raw in enumerate(ops):
            op = op_raw.get("op")
            try:
                if op == "set":
                    nid = op_raw.get("node_id")
                    field = op_raw.get("field")
                    if not nid or not field:
                        results.append({"i": i, "error": "set requires node_id and field"})
                        continue
                    node = resolve(nid)
                    if node is None:
                        results.append({"i": i, "error": f"node {nid!r} not found"})
                        continue
                    node[field] = op_raw.get("value")
                    any_change = True
                    results.append({"i": i, "ok": True, "op": "set", "node_id": nid, "field": field})

                elif op == "style":
                    nid = op_raw.get("node_id")
                    style = op_raw.get("style") or {}
                    if not nid:
                        results.append({"i": i, "error": "style requires node_id"})
                        continue
                    unknown = set(style.keys()) - _STYLE_FIELDS
                    if unknown:
                        results.append({"i": i, "error": f"unknown style fields: {sorted(unknown)}"})
                        continue
                    node = resolve(nid)
                    if node is None:
                        results.append({"i": i, "error": f"node {nid!r} not found"})
                        continue
                    existing = node.get("style_overrides") or {}
                    node["style_overrides"] = {**existing, **style}
                    any_change = True
                    results.append({"i": i, "ok": True, "op": "style", "node_id": nid})

                elif op == "insert":
                    pid = op_raw.get("parent_id")
                    nd = op_raw.get("node")
                    if not pid or nd is None:
                        results.append({"i": i, "error": "insert requires parent_id and node"})
                        continue
                    parent = resolve(pid)
                    if parent is None:
                        results.append({"i": i, "error": f"parent {pid!r} not found"})
                        continue
                    if "id" not in nd:
                        nd["id"] = str(uuid.uuid4())[:8]
                    ch = parent.setdefault("children", [])
                    idx = op_raw.get("index", len(ch))
                    idx = max(0, min(idx, len(ch)))
                    ch.insert(idx, nd)
                    any_change = True
                    results.append({"i": i, "ok": True, "op": "insert", "inserted_id": nd["id"]})

                elif op == "remove":
                    nid = op_raw.get("node_id")
                    if not nid:
                        results.append({"i": i, "error": "remove requires node_id"})
                        continue
                    _, parent_ch, idx = _find_node(state.dsl, nid)
                    if parent_ch is None:
                        results.append({"i": i, "error": f"node {nid!r} not found"})
                        continue
                    parent_ch.pop(idx)
                    any_change = True
                    results.append({"i": i, "ok": True, "op": "remove", "node_id": nid})

                elif op == "move":
                    nid = op_raw.get("node_id")
                    new_pid = op_raw.get("new_parent_id")
                    if not nid or not new_pid:
                        results.append({"i": i, "error": "move requires node_id and new_parent_id"})
                        continue
                    node_obj, parent_ch, idx = _find_node(state.dsl, nid)
                    if node_obj is None:
                        results.append({"i": i, "error": f"node {nid!r} not found"})
                        continue
                    new_parent = resolve(new_pid)
                    if new_parent is None:
                        results.append({"i": i, "error": f"new parent {new_pid!r} not found"})
                        continue
                    parent_ch.pop(idx)
                    ch = new_parent.setdefault("children", [])
                    new_idx = op_raw.get("index", len(ch))
                    new_idx = max(0, min(new_idx, len(ch)))
                    ch.insert(new_idx, node_obj)
                    any_change = True
                    results.append({"i": i, "ok": True, "op": "move", "node_id": nid})

                else:
                    results.append({"i": i, "error": f"unknown op {op!r}"})

            except Exception as exc:
                results.append({"i": i, "error": str(exc)})

        if any_change:
            state.dirty = True
        ok_count = sum(1 for r in results if r.get("ok"))
        err_count = len(results) - ok_count
        return {"ok": err_count == 0, "applied": ok_count, "failed": err_count, "results": results}

    return [
        get_layout, edit_layout, update_node, update_products, set_theme,
        ask_user, set_grid, style_region, add_banner, apply_dsl_patch,
    ]
