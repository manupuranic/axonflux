from datetime import datetime, timezone

from sqlalchemy.orm import Session

from api.tools.pamphlets.models import Pamphlet, PamphletItem
from api.tools.pamphlets.schemas import PamphletCreate, PamphletItemUpdate, PamphletUpdate


def create_pamphlet(db: Session, body: PamphletCreate, user_id: str) -> Pamphlet:
    pamphlet = Pamphlet(
        title=body.title,
        template_type=body.template_type,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        is_published=False,
        rows=body.rows,
        cols=body.cols,
    )
    db.add(pamphlet)
    db.flush()

    for i, item_data in enumerate(body.items):
        item = PamphletItem(
            pamphlet_id=pamphlet.id,
            barcode=item_data.barcode,
            display_name=item_data.display_name,
            offer_price=item_data.offer_price,
            original_price=item_data.original_price,
            highlight_text=item_data.highlight_text,
            sort_order=item_data.sort_order if item_data.sort_order is not None else i,
            image_url=item_data.image_url,
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
        image_url=item_data.image_url,
    )
    db.add(item)
    return item


def update_item(db: Session, item_id: str, body: PamphletItemUpdate) -> PamphletItem | None:
    item = db.query(PamphletItem).filter(PamphletItem.id == item_id).first()
    if not item:
        return None
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    return item


def remove_item(db: Session, item_id: str) -> bool:
    item = db.query(PamphletItem).filter(PamphletItem.id == item_id).first()
    if item:
        db.delete(item)
        return True
    return False


def duplicate_pamphlet(db: Session, pamphlet_id: str, user_id: str) -> Pamphlet | None:
    source = get_pamphlet(db, pamphlet_id)
    if not source:
        return None
    copy = Pamphlet(
        title=f"{source.title} (Copy)",
        template_type=source.template_type,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        valid_from=source.valid_from,
        valid_until=source.valid_until,
        is_published=False,
        rows=source.rows,
        cols=source.cols,
    )
    db.add(copy)
    db.flush()

    source_items = get_pamphlet_items(db, pamphlet_id)
    for item in source_items:
        db.add(PamphletItem(
            pamphlet_id=copy.id,
            barcode=item.barcode,
            display_name=item.display_name,
            offer_price=item.offer_price,
            original_price=item.original_price,
            highlight_text=item.highlight_text,
            sort_order=item.sort_order,
            image_url=item.image_url,
        ))
    return copy


def import_from_gsheet(
    db: Session,
    url: str,
    title: str,
    rows: int,
    cols: int,
    user_id: str,
) -> Pamphlet:
    import csv
    import io
    import httpx

    # Auto-convert regular Google Sheets URL to published CSV URL
    if "docs.google.com/spreadsheets/d/" in url and "output=csv" not in url:
        # Extract spreadsheet ID and convert to export URL
        import re
        m = re.search(r"/spreadsheets/d/([^/]+)", url)
        if m:
            sheet_id = m.group(1)
            url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"

    resp = httpx.get(url, follow_redirects=True, timeout=20)
    resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")
    if "html" in content_type:
        raise ValueError(
            "URL returned an HTML page instead of CSV. "
            "In Google Sheets: File → Share → Publish to web → choose CSV, then copy that URL."
        )

    reader = csv.DictReader(io.StringIO(resp.text))
    # Normalise header keys to lowercase stripped
    items_data = []
    for i, row in enumerate(reader):
        # Normalise: lowercase, spaces→underscores, strip punctuation like "."
        # So "Discount Type" → "discount_type", "Sl no." → "sl_no"
        norm = {
            k.strip().lower().replace(" ", "_").rstrip("."): (v or "").strip()
            for k, v in row.items() if k and k.strip()
        }
        name = norm.get("name") or norm.get("product_name") or norm.get("item") or ""
        if not name:
            continue
        try:
            mrp = float(norm.get("mrp") or 0) or None
        except ValueError:
            mrp = None
        dtype = (norm.get("discount_type") or norm.get("discount") or "").lower().strip()
        dval_raw = norm.get("discount_value") or norm.get("discount_amount") or ""
        try:
            dval = float(dval_raw) if dval_raw else None
        except ValueError:
            dval = None

        offer_price = None
        highlight_text = None
        if dtype == "percent" and mrp and dval:
            offer_price = round(mrp * (1 - dval / 100), 2)
            highlight_text = f"{int(dval)}% OFF"
        elif dtype == "amount" and mrp and dval:
            offer_price = round(mrp - dval, 2)
            highlight_text = f"Save ₹{int(dval)}"
        elif dtype in ("combo", "text") and dval_raw:
            highlight_text = dval_raw

        items_data.append({
            "barcode": None,
            "display_name": name,
            "original_price": mrp,
            "offer_price": offer_price,
            "highlight_text": highlight_text,
            "image_url": norm.get("image") or norm.get("image_url") or None,
            "sort_order": i,
        })

    if not items_data:
        raise ValueError(
            "No products found in the sheet. "
            "Ensure the sheet has a 'Name' column header and at least one data row."
        )

    pamphlet = Pamphlet(
        title=title,
        template_type="sale_offer",
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
        is_published=False,
        rows=rows,
        cols=cols,
    )
    db.add(pamphlet)
    db.flush()

    for d in items_data:
        db.add(PamphletItem(pamphlet_id=pamphlet.id, **d))

    return pamphlet


def bulk_update_highlights(db: Session, updates: list[dict]) -> None:
    """Apply {id, highlight_text} updates returned by the AI."""
    for u in updates:
        item = db.query(PamphletItem).filter(PamphletItem.id == u["id"]).first()
        if item:
            item.highlight_text = u["highlight_text"]


import uuid as _uuid
from api.tools.pamphlets.models import PamphletVersion, PamphletChatMessage
from api.ai.provider import Message

VERSION_RETENTION = 50


def create_version(
    db: Session,
    pamphlet_id: str,
    dsl: dict,
    theme: dict,
    parent_version_id,
    user_id,
    edit_summary: str,
) -> PamphletVersion:
    version = PamphletVersion(
        id=_uuid.uuid4(),
        pamphlet_id=pamphlet_id,
        template_dsl=dsl,
        theme=theme,
        parent_version_id=parent_version_id,
        created_by=user_id,
        edit_summary=edit_summary,
    )
    db.add(version)
    db.flush()
    _prune_old_versions(db, pamphlet_id)
    return version


def _prune_old_versions(db: Session, pamphlet_id: str) -> None:
    versions = (
        db.query(PamphletVersion)
        .filter(PamphletVersion.pamphlet_id == pamphlet_id)
        .order_by(PamphletVersion.created_at.desc())
        .all()
    )
    for old in versions[VERSION_RETENTION:]:
        db.delete(old)


def list_versions(db: Session, pamphlet_id: str) -> list:
    return (
        db.query(PamphletVersion)
        .filter(PamphletVersion.pamphlet_id == pamphlet_id)
        .order_by(PamphletVersion.created_at.desc())
        .all()
    )


def restore_version(db: Session, pamphlet_id: str, version_id: str, user_id: str):
    version = db.query(PamphletVersion).filter(PamphletVersion.id == version_id).first()
    if not version:
        return None
    pamphlet = get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        return None
    new_version = create_version(
        db, pamphlet_id, version.template_dsl, version.theme,
        parent_version_id=str(pamphlet.current_version_id) if pamphlet.current_version_id else None,
        user_id=user_id,
        edit_summary=f"Restored from version {str(version.id)[:8]}",
    )
    pamphlet.template_dsl = version.template_dsl
    pamphlet.theme = version.theme
    pamphlet.current_version_id = new_version.id
    return new_version


def save_chat_messages(
    db: Session,
    pamphlet_id: str,
    messages: list,
    version_id,
    user_id,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
) -> None:
    for msg in messages:
        if msg.role == "user" and not msg.tool_results and msg.content:
            db.add(PamphletChatMessage(
                id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                role="user", content=msg.content,
                user_id=user_id,
            ))
        elif msg.role == "assistant":
            db.add(PamphletChatMessage(
                id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                role="assistant", content=msg.content,
                version_id=version_id,
                provider=provider, model=model,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                cost_usd=cost_usd,
            ))
        elif msg.role == "user" and msg.tool_results:
            for tr in msg.tool_results:
                db.add(PamphletChatMessage(
                    id=_uuid.uuid4(), pamphlet_id=pamphlet_id,
                    role="tool", tool_call_name=tr.name,
                    tool_call_result=tr.result if isinstance(tr.result, dict) else {"value": str(tr.result)},
                    version_id=version_id,
                ))


def load_chat_history(db: Session, pamphlet_id: str) -> list:
    rows = (
        db.query(PamphletChatMessage)
        .filter(PamphletChatMessage.pamphlet_id == pamphlet_id)
        .order_by(PamphletChatMessage.created_at)
        .all()
    )
    messages = []
    for row in rows:
        if row.role == "user" and row.content:
            messages.append(Message(role="user", content=row.content))
        elif row.role == "assistant":
            messages.append(Message(role="assistant", content=row.content))
    return messages


def get_items_lookup(db: Session, pamphlet_id: str) -> dict:
    items = get_pamphlet_items(db, pamphlet_id)
    return {
        str(item.id): {
            "display_name": item.display_name,
            "offer_price": float(item.offer_price) if item.offer_price else None,
            "original_price": float(item.original_price) if item.original_price else None,
            "highlight_text": item.highlight_text,
            "image_url": item.image_url,
        }
        for item in items
    }
