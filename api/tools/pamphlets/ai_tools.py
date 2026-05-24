from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Any

from api.ai.tools import tool, Tool
from api.tools.pamphlets.themes import load_theme, apply_overrides, PRESET_IDS


@dataclass
class PamphletState:
    dsl: dict
    theme: dict
    items: dict[str, dict]
    dirty: bool = False


def _find_node(tree: dict, node_id: str) -> tuple[dict | None, list | None, int]:
    children = tree.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            return child, children, i
        found, lst, idx = _find_node(child, node_id)
        if found is not None:
            return found, lst, idx
    return None, None, -1


def build_tools(state: PamphletState) -> list[Tool]:

    @tool(
        description="Apply a named theme preset to the pamphlet.",
        parameters={"type": "object", "properties": {
            "name": {"type": "string", "enum": PRESET_IDS}
        }, "required": ["name"]}
    )
    def set_theme(name: str) -> dict:
        state.theme = {"preset": name}
        state.dsl["theme_id"] = name
        state.dirty = True
        return {"ok": True, "theme": name}

    @tool(
        description="Override individual theme token values (colors, typography, spacing).",
        parameters={"type": "object", "properties": {
            "section": {"type": "string", "enum": ["colors", "typography", "spacing", "radii", "decoration"]},
            "tokens": {"type": "object"}
        }, "required": ["section", "tokens"]}
    )
    def update_theme_tokens(section: str, tokens: dict) -> dict:
        state.theme.setdefault("overrides", {}).setdefault(section, {}).update(tokens)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Generate a new theme from a text description (e.g. 'rainy dark blue moody').",
        parameters={"type": "object", "properties": {
            "description": {"type": "string"}
        }, "required": ["description"]}
    )
    def generate_theme(description: str) -> dict:
        # Stub — real implementation added in Task 24
        return {"ok": True, "message": f"Generating theme for: {description}"}

    @tool(
        description="Insert a new node as a child of parent_id at given position (0 = first).",
        parameters={"type": "object", "properties": {
            "parent_id": {"type": "string"},
            "position": {"type": "integer"},
            "node": {"type": "object"}
        }, "required": ["parent_id", "position", "node"]}
    )
    def insert_node(parent_id: str, position: int, node: dict) -> dict:
        if "id" not in node:
            node["id"] = str(uuid.uuid4())[:8]
        parent, _, _ = _find_node(state.dsl, parent_id)
        if parent is None and state.dsl.get("id") == parent_id:
            parent = state.dsl
        if parent is None:
            return {"error": f"Parent node {parent_id!r} not found"}
        children = parent.setdefault("children", [])
        position = max(0, min(position, len(children)))
        children.insert(position, node)
        state.dirty = True
        return {"ok": True, "inserted_id": node["id"]}

    @tool(
        description="Update fields on an existing node by id.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "patch": {"type": "object"}
        }, "required": ["node_id", "patch"]}
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
        description="Remove a node by id.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"}
        }, "required": ["node_id"]}
    )
    def remove_node(node_id: str) -> dict:
        _, parent_children, idx = _find_node(state.dsl, node_id)
        if parent_children is None:
            return {"error": f"Node {node_id!r} not found"}
        parent_children.pop(idx)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Move a node to a new parent at a given position.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "new_parent_id": {"type": "string"},
            "new_position": {"type": "integer"}
        }, "required": ["node_id", "new_parent_id", "new_position"]}
    )
    def move_node(node_id: str, new_parent_id: str, new_position: int) -> dict:
        node, parent_children, idx = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        parent_children.pop(idx)
        new_parent, _, _ = _find_node(state.dsl, new_parent_id)
        if new_parent is None:
            return {"error": f"New parent {new_parent_id!r} not found"}
        children = new_parent.setdefault("children", [])
        children.insert(max(0, min(new_position, len(children))), node)
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Duplicate a node (deep copy) and insert it after the original.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"}
        }, "required": ["node_id"]}
    )
    def duplicate_node(node_id: str) -> dict:
        import copy
        node, parent_children, idx = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        clone = copy.deepcopy(node)
        clone["id"] = str(uuid.uuid4())[:8]
        parent_children.insert(idx + 1, clone)
        state.dirty = True
        return {"ok": True, "new_id": clone["id"]}

    @tool(
        description="Swap the product item referenced by a product node.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "new_item_id": {"type": "string"}
        }, "required": ["node_id", "new_item_id"]}
    )
    def swap_product(node_id: str, new_item_id: str) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node["item_id"] = new_item_id
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Sort product nodes within a section by a field.",
        parameters={"type": "object", "properties": {
            "section_id": {"type": "string"},
            "by": {"type": "string", "enum": ["price_asc","price_desc","name_asc","discount_pct_desc","category"]}
        }, "required": ["section_id", "by"]}
    )
    def sort_products(section_id: str, by: str) -> dict:
        section, _, _ = _find_node(state.dsl, section_id)
        if section is None:
            return {"error": f"Section {section_id!r} not found"}
        product_nodes = [c for c in section.get("children", []) if c.get("type") == "product"]
        other_nodes = [c for c in section.get("children", []) if c.get("type") != "product"]

        def key_fn(n):
            item = state.items.get(n.get("item_id", ""), {})
            offer = float(item.get("offer_price") or 0)
            mrp = float(item.get("original_price") or 0)
            name = (item.get("display_name") or "").lower()
            disc = ((mrp - offer) / mrp) if mrp > 0 else 0
            if by == "price_asc":    return offer
            if by == "price_desc":   return -offer
            if by == "name_asc":     return name
            if by == "discount_pct_desc": return -disc
            return name

        product_nodes.sort(key=key_fn)
        section["children"] = other_nodes + product_nodes
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Adjust font scale globally. target: all/headings/prices/body. delta: +0.1 = 10% bigger.",
        parameters={"type": "object", "properties": {
            "target": {"type": "string", "enum": ["all","headings","prices","body"]},
            "delta": {"type": "number"}
        }, "required": ["target", "delta"]}
    )
    def adjust_font_scale(target: str, delta: float) -> dict:
        state.theme.setdefault("font_scale", {}).update({target: delta})
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Apply style overrides to a specific node.",
        parameters={"type": "object", "properties": {
            "node_id": {"type": "string"},
            "style_overrides": {"type": "object"}
        }, "required": ["node_id", "style_overrides"]}
    )
    def set_node_style(node_id: str, style_overrides: dict) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node["style_overrides"] = style_overrides
        state.dirty = True
        return {"ok": True}

    @tool(
        description="Return 5 suggested pamphlet title options (no mutation — user picks one).",
        parameters={"type": "object", "properties": {
            "focus": {"type": "string"},
            "count": {"type": "integer"}
        }, "required": []}
    )
    def suggest_titles(focus: str = "", count: int = 5) -> dict:
        return {"message": f"Please suggest {count} pamphlet titles{' focused on ' + focus if focus else ''}. List them numbered so the user can pick."}

    @tool(
        description="Set the pamphlet title text (heading node at top of page).",
        parameters={"type": "object", "properties": {
            "text": {"type": "string"}
        }, "required": ["text"]}
    )
    def set_pamphlet_title(text: str) -> dict:
        state.theme["title"] = text
        def find_heading(tree):
            for c in tree.get("children", []):
                if c.get("type") == "text" and c.get("variant") == "heading":
                    return c
                found = find_heading(c)
                if found:
                    return found
            return None
        heading = find_heading(state.dsl)
        if heading:
            heading["content"] = text
        state.dirty = True
        return {"ok": True, "text": text}

    @tool(
        description="List all product items available in this pamphlet.",
        parameters={"type": "object", "properties": {}, "required": []}
    )
    def list_available_items() -> dict:
        return {"items": [
            {"item_id": k, "name": v.get("display_name"), "offer_price": v.get("offer_price")}
            for k, v in state.items.items()
        ]}

    @tool(
        description="Ask the user a clarifying question (no DSL mutation).",
        parameters={"type": "object", "properties": {
            "question": {"type": "string"}
        }, "required": ["question"]}
    )
    def ask_clarification(question: str) -> dict:
        return {"clarification_needed": question}

    return [
        set_theme, update_theme_tokens, generate_theme,
        insert_node, update_node, remove_node, move_node, duplicate_node,
        swap_product, sort_products,
        adjust_font_scale, set_node_style,
        suggest_titles, set_pamphlet_title,
        list_available_items, ask_clarification,
    ]
