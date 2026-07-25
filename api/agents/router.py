from __future__ import annotations
import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer

from api.dependencies import get_db, require_staff
from api.tools.pamphlets import service as pamphlet_svc
from api.agents.image_agent import start_scan_task, get_task

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _token_auth(
    token: str | None = Query(default=None),
    credentials=Depends(HTTPBearer(auto_error=False)),
):
    """Auth dependency that accepts token from Authorization header OR ?token= query param.

    EventSource (browser SSE) cannot send custom headers, so the query-param
    path is required for the stream endpoint.
    """
    raw = credentials.credentials if credentials else token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    from api.core.security import decode_access_token
    from api.schemas.auth import CurrentUser
    payload = decode_access_token(raw)
    if not payload.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return CurrentUser(
        id=payload.get("user_id", ""),
        username=payload["sub"],
        role=payload.get("role", "staff"),
        full_name=payload.get("full_name"),
    )


@router.post("/image/scan-all/{pamphlet_id}")
def trigger_image_scan(
    pamphlet_id: str,
    force: bool = Query(default=False),
    db=Depends(get_db),
    _=Depends(require_staff),
):
    """Trigger an image-scan task for all items in the pamphlet that lack an image_url.

    Pass ?force=true to rescan all items regardless of whether image_url is already set.
    """
    pamphlet = pamphlet_svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pamphlet not found")

    all_items = pamphlet_svc.get_pamphlet_items(db, pamphlet_id)
    items_needing_images = [
        {
            "id": str(item.id),
            "display_name": item.display_name or "",
            "barcode": item.barcode,
            "category": item.category,
            "unit": item.unit,
        }
        for item in all_items
        if force or not item.image_url
    ]

    if not items_needing_images:
        return {"task_id": None, "message": "All items already have images", "count": 0}

    from config.db import SessionLocal
    task_id = start_scan_task(pamphlet_id, items_needing_images, SessionLocal)
    return {"task_id": task_id, "count": len(items_needing_images)}


@router.post("/image/scan-one/{pamphlet_id}/{item_id}")
def trigger_single_image(
    pamphlet_id: str,
    item_id: str,
    db=Depends(get_db),
    _=Depends(require_staff),
):
    """Trigger an image-scan task for a single pamphlet item."""
    from api.tools.pamphlets.models import PamphletItem
    item = db.query(PamphletItem).filter(PamphletItem.id == item_id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    from config.db import SessionLocal
    items = [{
        "id": str(item.id),
        "display_name": item.display_name or "",
        "barcode": item.barcode,
        "category": item.category,
        "unit": item.unit,
    }]
    task_id = start_scan_task(pamphlet_id, items, SessionLocal)
    return {"task_id": task_id}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str, _=Depends(_token_auth)):
    """SSE stream for a running image-scan task.

    Clients poll this via EventSource, which cannot send Authorization headers,
    so authentication is handled via ?token= query param by _token_auth.
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    async def sse_generator() -> AsyncGenerator[str, None]:
        while True:
            t = get_task(task_id)
            if not t:
                break
            yield f"data: {json.dumps(t.to_dict())}\n\n"
            if t.status in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/tasks/{task_id}")
def get_task_status(task_id: str, _=Depends(require_staff)):
    """Polling fallback for task status (standard Bearer auth)."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task.to_dict()
