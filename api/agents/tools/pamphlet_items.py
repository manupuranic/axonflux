from __future__ import annotations

from api.ai.tools import tool, Tool
from api.tools.pamphlets.state import PamphletState


def _find_by_name(items: dict, name: str) -> tuple[str, dict] | None:
    name_lower = name.lower().strip()
    for item_id, data in items.items():
        if (data.get("display_name") or "").lower().strip() == name_lower:
            return item_id, data
    for item_id, data in items.items():
        if name_lower in (data.get("display_name") or "").lower():
            return item_id, data
    return None


def build_item_tools(state: PamphletState) -> list[Tool]:

    @tool(
        description=(
            "List all product items in this pamphlet with item_id, name, MRP, offer_price, highlight_text. "
            "Call this first so you know current values before staging changes."
        ),
        parameters={"type": "object", "properties": {}, "required": []},
    )
    def list_items() -> dict:
        return {
            "items": [
                {
                    "item_id": k,
                    "name": v.get("display_name"),
                    "mrp": v.get("original_price"),
                    "offer_price": v.get("offer_price"),
                    "highlight_text": v.get("highlight_text"),
                }
                for k, v in state.items.items()
            ]
        }

    @tool(
        description=(
            "Stage removal of one or more products by display name. "
            "Changes are NOT committed until the user clicks 'Apply Changes'. "
            "Uses case-insensitive fuzzy matching. "
            "Example: stage_remove_items(names=['Sugar', 'Putani', 'Hesaru bele'])"
        ),
        parameters={
            "type": "object",
            "properties": {
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Display names of products to remove.",
                }
            },
            "required": ["names"],
        },
    )
    def stage_remove_items(names: list[str]) -> dict:
        staged = []
        not_found = []
        for name in names:
            match = _find_by_name(state.items, name)
            if not match:
                not_found.append(name)
                continue
            item_id, data = match
            already = any(
                c["action"] == "remove" and c["item_id"] == item_id
                for c in state.pending_item_changes
            )
            if not already:
                state.pending_item_changes.append({
                    "action": "remove",
                    "item_id": item_id,
                    "item_name": data.get("display_name", name),
                })
            staged.append(data.get("display_name", name))
        return {"staged_for_removal": staged, "not_found": not_found}

    @tool(
        description=(
            "Stage price or name updates for one or more products. "
            "Changes are NOT committed until the user clicks 'Apply Changes'. "
            "Match by current display name (case-insensitive). "
            "Fields: mrp (original/MRP price), offer_price, display_name (rename), highlight_text. "
            "Example: stage_update_items(updates=["
            "{name:'Head Shoulders 650ml', mrp:510, offer_price:350}, "
            "{name:'Cashew nuts cut', mrp:1200, offer_price:799}])"
        ),
        parameters={
            "type": "object",
            "properties": {
                "updates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Current display name to match"},
                            "mrp": {"type": "number", "description": "New MRP / original price"},
                            "offer_price": {"type": "number", "description": "New offer/sale price"},
                            "display_name": {"type": "string", "description": "New display name (to rename the product)"},
                            "highlight_text": {"type": "string", "description": "New highlight badge text"},
                        },
                        "required": ["name"],
                    },
                    "description": "List of product updates to stage.",
                }
            },
            "required": ["updates"],
        },
    )
    def stage_update_items(updates: list[dict]) -> dict:
        staged = []
        not_found = []
        for upd in updates:
            name = upd.get("name", "")
            match = _find_by_name(state.items, name)
            if not match:
                not_found.append(name)
                continue
            item_id, data = match
            fields = {
                k: upd[k]
                for k in ("mrp", "offer_price", "display_name", "highlight_text")
                if k in upd and upd[k] is not None
            }
            if not fields:
                not_found.append(f"{name} (no valid fields)")
                continue
            # Auto-compute badge text when both prices given but no explicit highlight
            if "mrp" in fields and "offer_price" in fields and "highlight_text" not in fields:
                save = round(fields["mrp"] - fields["offer_price"])
                if save > 0:
                    fields["highlight_text"] = f"Save ₹{save}"
            # Replace any existing staged update for same item
            state.pending_item_changes[:] = [
                c for c in state.pending_item_changes
                if not (c["action"] == "update" and c["item_id"] == item_id)
            ]
            state.pending_item_changes.append({
                "action": "update",
                "item_id": item_id,
                "item_name": data.get("display_name", name),
                "fields": fields,
            })
            staged.append({"name": data.get("display_name", name), "fields": fields})
        return {"staged_updates": staged, "not_found": not_found}

    return [list_items, stage_remove_items, stage_update_items]
