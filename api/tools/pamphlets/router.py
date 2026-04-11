from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user
from api.schemas.auth import CurrentUser
from api.tools.pamphlets import MANIFEST
from api.tools.pamphlets.schemas import (
    PamphletCreate,
    PamphletItemCreate,
    PamphletItemResponse,
    PamphletResponse,
    PamphletSummary,
    PamphletUpdate,
)
from api.tools.pamphlets import service

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
            item_count=count,
        )
        for p, count in items
    ]
    return {"total": total, "limit": limit, "offset": offset, "items": summaries}


@router.post("", response_model=PamphletResponse, status_code=201)
def create_pamphlet(
    body: PamphletCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.create_pamphlet(db, body, current_user.id)
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
    db.flush()
    return PamphletItemResponse(
        id=str(item.id),
        pamphlet_id=str(item.pamphlet_id),
        barcode=item.barcode,
        display_name=item.display_name,
        offer_price=float(item.offer_price) if item.offer_price else None,
        original_price=float(item.original_price) if item.original_price else None,
        highlight_text=item.highlight_text,
        sort_order=item.sort_order,
    )


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


def _to_response(pamphlet, items) -> PamphletResponse:
    return PamphletResponse(
        id=str(pamphlet.id),
        title=pamphlet.title,
        template_type=pamphlet.template_type,
        created_at=pamphlet.created_at,
        valid_from=pamphlet.valid_from,
        valid_until=pamphlet.valid_until,
        is_published=pamphlet.is_published,
        items=[
            PamphletItemResponse(
                id=str(i.id),
                pamphlet_id=str(i.pamphlet_id),
                barcode=i.barcode,
                display_name=i.display_name,
                offer_price=float(i.offer_price) if i.offer_price else None,
                original_price=float(i.original_price) if i.original_price else None,
                highlight_text=i.highlight_text,
                sort_order=i.sort_order,
            )
            for i in items
        ],
    )
