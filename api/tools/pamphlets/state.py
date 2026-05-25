from __future__ import annotations
from dataclasses import dataclass
from typing import TYPE_CHECKING

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


def _find_node(tree: dict, node_id: str) -> tuple[dict | None, list | None, int]:
    children = tree.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            return child, children, i
        found, lst, idx = _find_node(child, node_id)
        if found is not None:
            return found, lst, idx
    return None, None, -1
