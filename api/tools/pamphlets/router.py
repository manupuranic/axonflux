from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user
from api.schemas.auth import CurrentUser
from api.tools.pamphlets import MANIFEST
from api.tools.pamphlets.schemas import (
    PamphletCreate,
    PamphletItemCreate,
    PamphletItemResponse,
    PamphletItemUpdate,
    PamphletResponse,
    PamphletSummary,
    PamphletUpdate,
)
from api.tools.pamphlets import service, ai as pamphlet_ai

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)


@router.get("", response_model=dict)
def list_pamphlets(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    total, items = service.list_pamphlets(db, limit, offset)
    summaries = [
        PamphletSummary(
            id=str(p.id),
            title=p.title,
            template_type=p.template_type,
            valid_from=p.valid_from,
            valid_until=p.valid_until,
            is_published=p.is_published,
            rows=p.rows,
            cols=p.cols,
            item_count=count,
        )
        for p, count in items
    ]
    return {"total": total, "limit": limit, "offset": offset, "items": [s.model_dump() for s in summaries]}


@router.post("", response_model=PamphletResponse, status_code=201)
def create_pamphlet(
    body: PamphletCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.create_pamphlet(db, body, current_user.id)
    db.commit()
    db.refresh(pamphlet)
    items = service.get_pamphlet_items(db, str(pamphlet.id))
    return _to_response(pamphlet, items)


@router.get("/{pamphlet_id}", response_model=PamphletResponse)
def get_pamphlet(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    items = service.get_pamphlet_items(db, pamphlet_id)
    return _to_response(pamphlet, items)


@router.delete("/{pamphlet_id}", status_code=204)
def delete_pamphlet(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    db.delete(pamphlet)
    db.commit()


@router.patch("/{pamphlet_id}", response_model=PamphletResponse)
def update_pamphlet(
    pamphlet_id: str,
    body: PamphletUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.update_pamphlet(db, pamphlet_id, body)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    db.commit()
    db.refresh(pamphlet)
    items = service.get_pamphlet_items(db, pamphlet_id)
    return _to_response(pamphlet, items)


@router.post("/{pamphlet_id}/items", response_model=PamphletItemResponse, status_code=201)
def add_item(
    pamphlet_id: str,
    body: PamphletItemCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    item = service.add_item(db, pamphlet_id, body)
    db.commit()
    db.refresh(item)
    return _item_to_response(item)


@router.patch("/{pamphlet_id}/items/{item_id}", response_model=PamphletItemResponse)
def update_item(
    pamphlet_id: str,
    item_id: str,
    body: PamphletItemUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    item = service.update_item(db, item_id, body)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    db.commit()
    db.refresh(item)
    return _item_to_response(item)


@router.delete("/{pamphlet_id}/items/{item_id}", status_code=204)
def remove_item(
    pamphlet_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    removed = service.remove_item(db, item_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    db.commit()


@router.post("/{pamphlet_id}/duplicate", response_model=PamphletResponse, status_code=201)
def duplicate_pamphlet(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    copy = service.duplicate_pamphlet(db, pamphlet_id, current_user.id)
    if not copy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    db.commit()
    db.refresh(copy)
    items = service.get_pamphlet_items(db, str(copy.id))
    return _to_response(copy, items)


class GSheetImportRequest(BaseModel):
    url: str
    title: str
    rows: int = 4
    cols: int = 5


@router.post("/import-gsheet", response_model=PamphletResponse, status_code=201)
def import_from_gsheet(
    body: GSheetImportRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        pamphlet = service.import_from_gsheet(
            db, body.url, body.title, body.rows, body.cols, current_user.id
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Import failed: {e}")
    db.commit()
    db.refresh(pamphlet)
    items = service.get_pamphlet_items(db, str(pamphlet.id))
    return _to_response(pamphlet, items)


@router.post("/{pamphlet_id}/ai/highlights", response_model=PamphletResponse)
def generate_ai_highlights(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    items = service.get_pamphlet_items(db, pamphlet_id)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pamphlet has no items")

    try:
        updates = pamphlet_ai.generate_highlights(items)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI generation failed: {e}")

    service.bulk_update_highlights(db, updates)
    db.commit()
    items = service.get_pamphlet_items(db, pamphlet_id)
    return _to_response(pamphlet, items)


def _item_to_response(item) -> PamphletItemResponse:
    return PamphletItemResponse(
        id=str(item.id),
        pamphlet_id=str(item.pamphlet_id),
        barcode=item.barcode,
        display_name=item.display_name,
        offer_price=float(item.offer_price) if item.offer_price is not None else None,
        original_price=float(item.original_price) if item.original_price is not None else None,
        highlight_text=item.highlight_text,
        sort_order=item.sort_order,
        image_url=item.image_url,
    )


def _to_response(pamphlet, items) -> PamphletResponse:
    return PamphletResponse(
        id=str(pamphlet.id),
        title=pamphlet.title,
        template_type=pamphlet.template_type,
        created_at=pamphlet.created_at,
        valid_from=pamphlet.valid_from,
        valid_until=pamphlet.valid_until,
        is_published=pamphlet.is_published,
        rows=pamphlet.rows,
        cols=pamphlet.cols,
        items=[_item_to_response(i) for i in items],
    )
