from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user
from api.schemas.auth import CurrentUser
from api.tools.pamphlets import MANIFEST
from api.tools.pamphlets.schemas import (
    ApplyItemChangesRequest,
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
    PendingItemChange,
    ToolCallInfo,
    VersionResponse,
)
from api.tools.pamphlets import service, ai as pamphlet_ai
from api.tools.pamphlets import service as svc
from api.tools.pamphlets.ai_session import make_pamphlet_session
from api.tools.pamphlets.render.html import render_pamphlet as render_html
from api.tools.pamphlets.render.validator import sanitize_html, sanitize_svg
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


@router.get("/models", response_model=list[ModelInfo])
def list_models(_=Depends(get_current_user)):
    labels = {
        "claude-opus-4-7": "Claude Opus 4.7", "claude-sonnet-4-6": "Claude Sonnet 4.6",
        "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
        "gpt-4o": "GPT-4o", "gpt-4o-mini": "GPT-4o Mini", "gpt-4-turbo": "GPT-4 Turbo",
        "anthropic/claude-sonnet-4-6": "Claude Sonnet (OpenRouter)",
        "anthropic/claude-haiku-4-5-20251001": "Claude Haiku (OpenRouter)",
        "anthropic/claude-opus-4-7": "Claude Opus (OpenRouter)",
        "openai/gpt-4o": "GPT-4o (OpenRouter)",
        "openai/gpt-4o-mini": "GPT-4o Mini (OpenRouter)",
        "google/gemini-2.0-flash-001": "Gemini 2.0 Flash",
        "meta-llama/llama-3.1-70b-instruct": "Llama 3.1 70B",
        "deepseek/deepseek-chat": "DeepSeek Chat",
    }
    return [
        ModelInfo(provider=p, model=m, display_name=labels.get(m, m))
        for p, models in ALLOWED_MODELS.items()
        for m in models
    ]


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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    item = service.add_item(db, pamphlet_id, body)
    db.commit()
    db.refresh(item)
    if not item.image_url:
        from config.db import SessionLocal
        from api.agents.image_agent import start_scan_task
        background_tasks.add_task(
            start_scan_task,
            pamphlet_id=pamphlet_id,
            items=[{
                "id": str(item.id),
                "display_name": item.display_name or "",
                "barcode": item.barcode,
                "category": item.category,
                "unit": item.unit,
            }],
            db_factory=SessionLocal,
        )
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


def _purge_product_nodes(tree: dict, item_ids: set) -> dict:
    """Recursively remove product nodes whose item_id is in item_ids."""
    children = tree.get("children")
    if not children:
        return tree
    kept = [
        _purge_product_nodes(c, item_ids)
        for c in children
        if not (c.get("type") == "product" and c.get("item_id") in item_ids)
    ]
    return {**tree, "children": kept}


@router.post("/{pamphlet_id}/items/apply-changes")
def apply_item_changes(
    pamphlet_id: str,
    body: ApplyItemChangesRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    import copy as _copy
    from sqlalchemy.orm.attributes import flag_modified
    from api.tools.pamphlets.models import PamphletItem

    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")

    applied = []
    removed_ids: set[str] = set()

    for change in body.changes:
        if change.action == "remove":
            removed = service.remove_item(db, change.item_id)
            if removed:
                removed_ids.add(change.item_id)
                applied.append({"action": "remove", "item_name": change.item_name})
        elif change.action == "update" and change.fields:
            item = db.query(PamphletItem).filter(PamphletItem.id == change.item_id).first()
            if item:
                if "mrp" in change.fields:
                    item.original_price = change.fields["mrp"]
                if "offer_price" in change.fields:
                    item.offer_price = change.fields["offer_price"]
                if "display_name" in change.fields:
                    item.display_name = change.fields["display_name"]
                if "highlight_text" in change.fields:
                    item.highlight_text = change.fields["highlight_text"]
                applied.append({"action": "update", "item_name": change.item_name, "fields": change.fields})

    # Purge dead product nodes from DSL so preview doesn't show placeholder cards
    if removed_ids and pamphlet.template_dsl:
        new_dsl = _purge_product_nodes(_copy.deepcopy(pamphlet.template_dsl), removed_ids)
        pamphlet.template_dsl = new_dsl
        flag_modified(pamphlet, "template_dsl")

    db.commit()
    return {"applied": applied, "count": len(applied), "dsl": pamphlet.template_dsl}


class NodeContentUpdate(BaseModel):
    content: str


@router.patch("/{pamphlet_id}/nodes/{node_id}/content")
def update_node_content(
    pamphlet_id: str,
    node_id: str,
    body: NodeContentUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    import copy as _copy
    from sqlalchemy.orm.attributes import flag_modified
    from api.tools.pamphlets.state import _find_node
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet or not pamphlet.template_dsl:
        raise HTTPException(404, "Pamphlet not found")
    dsl = _copy.deepcopy(pamphlet.template_dsl)
    node, _, _ = _find_node(dsl, node_id)
    if node is None:
        raise HTTPException(404, f"Node {node_id!r} not found in DSL")
    node["content"] = body.content
    pamphlet.template_dsl = dsl
    flag_modified(pamphlet, "template_dsl")
    db.commit()
    return {"ok": True, "node_id": node_id, "content": body.content}


@router.post("/{pamphlet_id}/purge-orphaned-nodes")
def purge_orphaned_nodes(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    import copy as _copy
    from sqlalchemy.orm.attributes import flag_modified
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    valid_ids = {str(item.id) for item in svc.get_pamphlet_items(db, pamphlet_id)}
    if not pamphlet.template_dsl:
        return {"purged": 0}

    def _purge_invalid(tree: dict) -> tuple[dict, int]:
        children = tree.get("children")
        if not children:
            return tree, 0
        kept, total = [], 0
        for c in children:
            if c.get("type") == "product" and c.get("item_id") not in valid_ids:
                total += 1
            else:
                child, n = _purge_invalid(c)
                kept.append(child)
                total += n
        return {**tree, "children": kept}, total

    new_dsl, purged = _purge_invalid(_copy.deepcopy(pamphlet.template_dsl))
    if purged:
        pamphlet.template_dsl = new_dsl
        flag_modified(pamphlet, "template_dsl")
        db.commit()
    return {"purged": purged}


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

    try:
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
            db=db,
            pamphlet_id=pamphlet_id,
        )

        try:
            turn = session.send(body.message)
        except Exception as e:
            raise HTTPException(502, f"AI error: {e}")

        version = None
        if state.dirty:
            _sanitize_dsl_inplace(state.dsl)
            # Validate DSL before saving — reject if Pydantic can't parse it
            # (normalizer already remaps common LLM type mistakes)
            try:
                from api.tools.pamphlets.render.html import render_pamphlet as _rp
                _rp(state.dsl, state.theme or {}, {})
            except Exception as dsl_err:
                import logging
                logging.getLogger(__name__).warning(
                    "Chat produced invalid DSL for pamphlet %s, discarding: %s", pamphlet_id, dsl_err
                )
                state.dirty = False  # don't save the bad DSL
            else:
                pass  # valid — fall through to create_version
        if state.dirty:
            version = svc.create_version(
                db, pamphlet_id, state.dsl, state.theme,
                parent_version_id=str(pamphlet.current_version_id) if pamphlet.current_version_id else None,
                user_id=current_user.id,
                edit_summary=_summarize_turn(turn),
            )
            import copy
            from sqlalchemy.orm.attributes import flag_modified
            pamphlet.template_dsl = copy.deepcopy(state.dsl)
            pamphlet.theme = copy.deepcopy(state.theme) if state.theme else None
            pamphlet.current_version_id = version.id
            flag_modified(pamphlet, "template_dsl")
            flag_modified(pamphlet, "theme")

        svc.save_chat_messages(
            db, pamphlet_id, turn.new_messages,
            version_id=str(version.id) if version else None,
            user_id=current_user.id,
            provider=turn.provider, model=turn.model,
            prompt_tokens=turn.prompt_tokens, completion_tokens=turn.completion_tokens,
            cost_usd=float(turn.cost_usd),
        )
        db.commit()

    except HTTPException:
        raise
    except BaseException as e:
        import logging
        logging.getLogger(__name__).exception("Chat endpoint crashed for pamphlet %s", pamphlet_id)
        db.rollback()
        raise HTTPException(500, f"Chat error: {type(e).__name__}: {e}")

    return ChatResponse(
        assistant_text=turn.assistant_text,
        tool_calls=[ToolCallInfo(tool_name=e.tool_name, args=e.args, result=e.result, is_error=e.is_error) for e in turn.tool_executions],
        version_id=str(version.id) if version else None,
        dsl=state.dsl,
        theme=state.theme,
        cost_usd=float(turn.cost_usd),
        provider=turn.provider,
        model=turn.model,
        pending_item_changes=[PendingItemChange(**c) for c in state.pending_item_changes],
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

    from api.tools.pamphlets.render.pdf import render_html_to_pdf
    try:
        pdf_bytes = await render_html_to_pdf(html)
    except Exception as e:
        raise HTTPException(502, f"PDF render failed: {e}")

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pamphlet.title}.pdf"'},
    )


@router.post("/{pamphlet_id}/export-image")
async def export_image(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from fastapi.responses import Response as FastAPIResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        raise HTTPException(400, "Pamphlet has no DSL")

    items = svc.get_items_lookup(db, pamphlet_id)
    html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)

    from api.tools.pamphlets.render.pdf import render_html_to_image
    try:
        img_bytes = await render_html_to_image(html)
    except Exception as e:
        raise HTTPException(502, f"Image render failed: {e}")

    return FastAPIResponse(
        content=img_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{pamphlet.title}.png"'},
    )


def _user_from_query_token(
    token: str | None = Query(default=None),
    credentials=Depends(HTTPBearer(auto_error=False)),
):
    raw = credentials.credentials if credentials else token
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    from api.core.security import decode_access_token
    from api.schemas.auth import CurrentUser as CU
    payload = decode_access_token(raw)
    if not payload.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return CU(id=payload.get("user_id", ""), username=payload["sub"],
               role=payload.get("role", "staff"), full_name=payload.get("full_name"))


@router.get("/{pamphlet_id}/preview-html")
def preview_html(
    pamphlet_id: str,
    db: Session = Depends(get_db),
    _=Depends(_user_from_query_token),
):
    from fastapi.responses import HTMLResponse
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")
    if not pamphlet.template_dsl:
        return HTMLResponse("<html><body>No DSL yet — use chat to generate layout.</body></html>")
    items = svc.get_items_lookup(db, pamphlet_id)
    try:
        html = render_html(pamphlet.template_dsl, pamphlet.theme or {}, items)
    except Exception as exc:
        html = (
            f"<html><body style='font-family:monospace;padding:24px;color:#c00'>"
            f"<strong>Preview error:</strong> {exc}<br><br>"
            f"Restore a previous version from the chat panel to recover."
            f"</body></html>"
        )
    return HTMLResponse(html)


def _sanitize_dsl_inplace(node: dict) -> None:
    if node.get("type") == "custom_html" and "html" in node:
        node["html"] = sanitize_html(node["html"])
    if node.get("type") == "raw_svg" and "svg" in node:
        node["svg"] = sanitize_svg(node["svg"])
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
        category=item.category,
        unit=item.unit,
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
        template_dsl=pamphlet.template_dsl,
        theme=pamphlet.theme,
        items=[_item_to_response(i) for i in items],
    )
