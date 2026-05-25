from __future__ import annotations
import copy
import uuid

from api.ai.tools import tool, Tool
from api.tools.pamphlets.state import PamphletState, _find_node
from api.tools.pamphlets.themes import PRESET_IDS


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
            "Structural tree operations: insert/remove/move/duplicate a node, or sort products. "
            "insert: parent_id, position (int), node (dict with type + fields). "
            "remove: node_id. "
            "move: node_id, new_parent_id, new_position. "
            "duplicate: node_id. "
            "sort: section_id, sort_by (price_asc|price_desc|name_asc|discount_pct_desc|category)."
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
            parent_children.pop(idx)
            new_parent, _, _ = _find_node(state.dsl, new_parent_id)
            if new_parent is None:
                return {"error": f"New parent {new_parent_id!r} not found"}
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

    @tool(
        description=(
            "Update any fields on a DSL node by ID. "
            "patch can include: content, style_overrides, cols, rows, item_id, show_image, "
            "variant, gap, layout, headline, subtext, phone, address, and any other node field. "
            "Examples: update_node(id, {cols:4}) to resize grid; "
            "update_node(id, {style_overrides:{color_token:'accent'}}) for styling; "
            "update_node(id, {content:'New Title'}) to change text."
        ),
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string"},
                "patch": {"type": "object"},
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
            import os
            import json
            import anthropic as sdk
            client = sdk.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            prompt = (
                f'Generate a retail pamphlet color theme for: "{description}"\n'
                'Return ONLY valid JSON:\n'
                '{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","bg":"#hex","surface":"#hex",'
                '"text":"#hex","text_muted":"#hex","border":"#hex","success":"#hex","danger":"#hex"},'
                '"decoration":{"bg_gradient":"linear-gradient(...)"}}'
            )
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=512,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = resp.content[0].text.strip().strip("```json").strip("```").strip()
            generated = json.loads(raw)
            state.theme = {"preset": "minimal_light", "overrides": generated}
            state.dsl["theme_id"] = "minimal_light"
            state.dirty = True
            return {"ok": True, "generated_tokens": generated}

        if preset:
            state.theme = {"preset": preset}
            state.dsl["theme_id"] = preset
            state.dirty = True

        if overrides:
            for section, tokens in overrides.items():
                state.theme.setdefault("overrides", {}).setdefault(section, {}).update(tokens)
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

    return [get_layout, edit_layout, update_node, update_products, set_theme, ask_user]
