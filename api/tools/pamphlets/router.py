from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user
from api.schemas.auth import CurrentUser
from api.tools.pamphlets import MANIFEST
from api.tools.pamphlets.schemas import (
    ChatRequest,
    ChatResponse,
    ModelInfo,
    PamphletCreate,
    PamphletItemCreate,
    PamphletItemResponse,
    PamphletItemUpdate,
    PamphletResponse,
    PamphletSummary,
    PamphletUpdate,
    ToolCallInfo,
    VersionResponse,
)
from api.tools.pamphlets import service, ai as pamphlet_ai
from api.tools.pamphlets import service as svc
from api.tools.pamphlets.ai_session import make_pamphlet_session
from api.tools.pamphlets.render.html import render_pamphlet as render_html
from api.ai.config import ALLOWED_MODELS

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


@router.post("/{pamphlet_id}/chat", response_model=ChatResponse)
def chat(
    pamphlet_id: str,
    body: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")

    dsl = pamphlet.template_dsl or {}
    theme = pamphlet.theme or {"preset": "minimal_light"}
    items = svc.get_items_lookup(db, pamphlet_id)
    history = svc.load_chat_history(db, pamphlet_id)

    session, state = make_pamphlet_session(
        dsl=dsl, theme=theme, items=items,
        pamphlet_title=pamphlet.title,
        history=history,
        provider=body.provider,
        model=body.model,
    )

    try:
        turn = session.send(body.message)
    except Exception as e:
        raise HTTPException(502, f"AI error: {e}")

    version = None
    if state.dirty:
        _sanitize_dsl_inplace(state.dsl)
        version = svc.create_version(
            db, pamphlet_id, state.dsl, state.theme,
            parent_version_id=str(pamphlet.current_version_id) if pamphlet.current_version_id else None,
            user_id=current_user.id,
            edit_summary=_summarize_turn(turn),
        )
        pamphlet.template_dsl = state.dsl
        pamphlet.theme = state.theme
        pamphlet.current_version_id = version.id

    svc.save_chat_messages(
        db, pamphlet_id, turn.new_messages,
        version_id=str(version.id) if version else None,
        user_id=current_user.id,
        provider=turn.provider, model=turn.model,
        prompt_tokens=turn.prompt_tokens, completion_tokens=turn.completion_tokens,
        cost_usd=float(turn.cost_usd),
    )
    db.commit()

    return ChatResponse(
        assistant_text=turn.assistant_text,
        tool_calls=[ToolCallInfo(tool_name=e.tool_name, args=e.args, result=e.result, is_error=e.is_error) for e in turn.tool_executions],
        version_id=str(version.id) if version else None,
        dsl=state.dsl,
        theme=state.theme,
        cost_usd=float(turn.cost_usd),
        provider=turn.provider,
        model=turn.model,
    )


@router.get("/{pamphlet_id}/versions", response_model=list[VersionResponse])
def get_versions(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return [
        VersionResponse(
            id=str(v.id), pamphlet_id=str(v.pamphlet_id),
            edit_summary=v.edit_summary, created_at=v.created_at,
            created_by=str(v.created_by) if v.created_by else None,
        )
        for v in svc.list_versions(db, pamphlet_id)
    ]


@router.post("/{pamphlet_id}/versions/{version_id}/restore", response_model=VersionResponse)
def restore_version(
    pamphlet_id: str, version_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    version = svc.restore_version(db, pamphlet_id, version_id, current_user.id)
    if not version:
        raise HTTPException(404, "Version not found")
    db.commit()
    return VersionResponse(
        id=str(version.id), pamphlet_id=str(version.pamphlet_id),
        edit_summary=version.edit_summary, created_at=version.created_at,
        created_by=str(version.created_by) if version.created_by else None,
    )


@router.post("/{pamphlet_id}/export-pdf")
async def export_pdf(
    pamphlet_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from fastapi.responses import Response as FastAPIResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        raise HTTPException(400, "Pamphlet has no DSL — use chat to generate a layout first")

    items = svc.get_items_lookup(db, pamphlet_id)
    html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)

    browser = request.app.state.browser
    from api.tools.pamphlets.render.pdf import render_html_to_pdf
    try:
        pdf_bytes = await render_html_to_pdf(html, browser)
    except Exception as e:
        raise HTTPException(502, f"PDF render failed: {e}")

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pamphlet.title}.pdf"'},
    )


@router.get("/{pamphlet_id}/preview-html")
def preview_html(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from fastapi.responses import HTMLResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        return HTMLResponse("<html><body>No DSL yet — use chat to generate layout.</body></html>")
    items = svc.get_items_lookup(db, pamphlet_id)
    html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)
    return HTMLResponse(html)


@router.get("/models", response_model=list[ModelInfo])
def list_models(_=Depends(get_current_user)):
    labels = {
        "claude-opus-4-7": "Claude Opus 4.7", "claude-sonnet-4-6": "Claude Sonnet 4.6",
        "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
        "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o Mini", "gpt-4-turbo": "GPT-4 Turbo",
        "anthropic/claude-sonnet-4-6": "Claude Sonnet (OpenRouter)",
        "openai/gpt-4o": "GPT-4o (OpenRouter)",
        "meta-llama/llama-3.1-70b-instruct": "Llama 3.1 70B",
        "deepseek/deepseek-chat": "DeepSeek Chat",
    }
    return [
        ModelInfo(provider=p, model=m, display_name=labels.get(m, m))
        for p, models in ALLOWED_MODELS.items()
        for m in models
    ]


def _sanitize_dsl_inplace(node: dict) -> None:
    # Sanitizers applied in Task 23; stub here for safety
    for child in node.get("children", []):
        _sanitize_dsl_inplace(child)


def _summarize_turn(turn) -> str:
    names = [e.tool_name for e in turn.tool_executions if not e.is_error]
    if not names:
        return "Chat (no changes)"
    unique = list(dict.fromkeys(names))
    return ", ".join(unique[:3]) + ("..." if len(unique) > 3 else "")


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
