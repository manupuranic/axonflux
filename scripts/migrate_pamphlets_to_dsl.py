#!/usr/bin/env python
"""Migrate legacy grid pamphlets to DSL format.

Run: PYTHONPATH=. python scripts/migrate_pamphlets_to_dsl.py [--dry-run]
"""
import sys
import uuid
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from config.db import SessionLocal
from api.tools.pamphlets.models import Pamphlet, PamphletItem, PamphletVersion


DRY_RUN = "--dry-run" in sys.argv


def items_to_grid_dsl(pamphlet: Pamphlet, items: list) -> dict:
    cols = pamphlet.cols or 5
    slots = []
    for item in sorted(items, key=lambda x: x.sort_order or 0):
        slots.append({
            "type": "slot", "id": str(uuid.uuid4())[:8],
            "children": [{
                "type": "product", "id": str(uuid.uuid4())[:8],
                "item_id": str(item.id),
                "layout": "card", "show_image": True, "show_mrp": True,
                "show_offer": True, "show_badge": True,
            }]
        })
    return {
        "type": "page", "id": str(uuid.uuid4())[:8],
        "theme_id": "minimal_light",
        "children": [{
            "type": "section", "id": str(uuid.uuid4())[:8],
            "layout": "grid", "cols": cols, "gap": "sm",
            "children": slots,
        }]
    }


def main():
    db = SessionLocal()
    try:
        pamphlets = db.query(Pamphlet).filter(Pamphlet.template_dsl.is_(None)).all()
        print(f"Found {len(pamphlets)} legacy pamphlets to migrate")

        for p in pamphlets:
            items = db.query(PamphletItem).filter(PamphletItem.pamphlet_id == p.id).all()
            dsl = items_to_grid_dsl(p, items)
            theme = {"preset": "minimal_light"}

            version = PamphletVersion(
                id=uuid.uuid4(),
                pamphlet_id=p.id,
                template_dsl=dsl,
                theme=theme,
                edit_summary="Migrated from legacy grid",
            )

            if not DRY_RUN:
                db.add(version)
                db.flush()
                p.template_dsl = dsl
                p.theme = theme
                p.template_type = "dsl"
                p.current_version_id = version.id

            print(f"  {'[DRY] ' if DRY_RUN else ''}Migrated: {p.title} ({len(items)} items, {p.cols or 5} cols)")

        if not DRY_RUN:
            db.commit()
            print("Migration committed.")
        else:
            print("Dry run complete — no changes written.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
