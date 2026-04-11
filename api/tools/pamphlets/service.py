from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from api.tools.pamphlets.models import Pamphlet, PamphletItem
from api.tools.pamphlets.schemas import PamphletCreate, PamphletUpdate


def create_pamphlet(db: Session, body: PamphletCreate, user_id: str) -> Pamphlet:
    pamphlet = Pamphlet(
        title=body.title,
        template_type=body.template_type,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        is_published=False,
    )
    db.add(pamphlet)
    db.flush()  # get the generated ID

    for i, item_data in enumerate(body.items):
        item = PamphletItem(
            pamphlet_id=pamphlet.id,
            barcode=item_data.barcode,
            display_name=item_data.display_name,
            offer_price=item_data.offer_price,
            original_price=item_data.original_price,
            highlight_text=item_data.highlight_text,
            sort_order=item_data.sort_order if item_data.sort_order is not None else i,
        )
        db.add(item)

    return pamphlet


def list_pamphlets(db: Session, limit: int = 30, offset: int = 0) -> tuple[int, list]:
    q = db.query(Pamphlet).order_by(Pamphlet.created_at.desc())
    total = q.count()
    pamphlets = q.limit(limit).offset(offset).all()

    results = []
    for p in pamphlets:
        item_count = db.query(PamphletItem).filter(PamphletItem.pamphlet_id == p.id).count()
        results.append((p, item_count))
    return total, results


def get_pamphlet(db: Session, pamphlet_id: str) -> Pamphlet | None:
    return db.query(Pamphlet).filter(Pamphlet.id == pamphlet_id).first()


def get_pamphlet_items(db: Session, pamphlet_id: str) -> list[PamphletItem]:
    return (
        db.query(PamphletItem)
        .filter(PamphletItem.pamphlet_id == pamphlet_id)
        .order_by(PamphletItem.sort_order)
        .all()
    )


def update_pamphlet(db: Session, pamphlet_id: str, body: PamphletUpdate) -> Pamphlet | None:
    pamphlet = get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        return None
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pamphlet, field, value)
    return pamphlet


def add_item(db: Session, pamphlet_id: str, item_data) -> PamphletItem:
    item = PamphletItem(
        pamphlet_id=pamphlet_id,
        barcode=item_data.barcode,
        display_name=item_data.display_name,
        offer_price=item_data.offer_price,
        original_price=item_data.original_price,
        highlight_text=item_data.highlight_text,
        sort_order=item_data.sort_order,
    )
    db.add(item)
    return item


def remove_item(db: Session, item_id: str) -> bool:
    item = db.query(PamphletItem).filter(PamphletItem.id == item_id).first()
    if item:
        db.delete(item)
        return True
    return False
