from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class PamphletState:
    dsl: dict
    theme: dict
    items: dict[str, dict]
    dirty: bool = False
    db: "Session | None" = None
    pamphlet_id: str = ""
    pending_item_changes: list = field(default_factory=list)
    # SQLAlchemy model backing product rows. Pamphlets use PamphletItem (default);
    # Campaign Studio injects CampaignProduct. update_products() writes to whichever
    # is set here — without this, the shared tool always queried PamphletItem and
    # silently matched 0 rows for Campaign Studio item_ids.
    product_model: Any = None


def _find_node(tree: dict, node_id: str) -> tuple[dict | None, list | None, int]:
    children = tree.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            return child, children, i
        found, lst, idx = _find_node(child, node_id)
        if found is not None:
            return found, lst, idx
    return None, None, -1
