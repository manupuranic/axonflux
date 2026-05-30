from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user
from api.schemas.auth import CurrentUser
from api.tools.campaign_studio import MANIFEST
from api.tools.campaign_studio import service as svc
from api.tools.campaign_studio.asset_service import get_asset_service
from api.tools.campaign_studio.models import AssetLibrary
from api.tools.campaign_studio.schemas import (
    CampaignCreate, CampaignUpdate, CampaignResponse, CampaignSummary,
    CampaignProductCreate, CampaignProductUpdate, CampaignProductResponse,
    CampaignDesignCreate, CampaignDesignUpdate, CampaignDesignResponse, CampaignDesignSummary,
    DesignVersionResponse,
    AssetLibraryResponse,
    CampaignAssetCreate, CampaignAssetResponse,
    ExportToPamphletRequest,
    DesignChatRequest, DesignChatResponse, DesignToolCallInfo,
    CAMPAIGN_TYPES, CAMPAIGN_OBJECTIVES, DESIGN_TYPES, DESIGN_TARGETS, ASSET_KINDS,
)

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)


# ---------------------------------------------------------------------------
# Meta — let frontend discover valid enum values
# ---------------------------------------------------------------------------

@router.get("/meta")
def get_meta(_=Depends(get_current_user)):
    return {
        "campaign_types": CAMPAIGN_TYPES,
        "objectives": CAMPAIGN_OBJECTIVES,
        "design_types": DESIGN_TYPES,
        "targets": DESIGN_TARGETS,
        "asset_kinds": ASSET_KINDS,
    }


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

@router.get("/campaigns", response_model=dict)
def list_campaigns(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    total, items = svc.list_campaigns(db, limit, offset, status)
    summaries = [
        CampaignSummary(
            id=str(c.id),
            title=c.title,
            campaign_type=c.campaign_type,
            objective=c.objective,
            channels=c.channels or [],
            status=c.status,
            created_at=c.created_at,
            valid_from=c.valid_from,
            valid_until=c.valid_until,
            product_count=pc,
            design_count=dc,
        )
        for c, pc, dc in items
    ]
    return {"total": total, "limit": limit, "offset": offset, "items": [s.model_dump() for s in summaries]}


@router.post("/campaigns", response_model=CampaignResponse, status_code=201)
def create_campaign(
    body: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    campaign = svc.create_campaign(db, body, current_user.id)
    db.commit()
    db.refresh(campaign)
    return _campaign_to_response(db, campaign)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
def get_campaign(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    campaign = svc.get_campaign(db, campaign_id)
    if not campaign:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return _campaign_to_response(db, campaign)


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    campaign = svc.update_campaign(db, campaign_id, body)
    if not campaign:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    db.commit()
    db.refresh(campaign)
    return _campaign_to_response(db, campaign)


@router.delete("/campaigns/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    campaign = svc.get_campaign(db, campaign_id)
    if not campaign:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    db.delete(campaign)
    db.commit()


@router.post("/campaigns/{campaign_id}/duplicate", response_model=CampaignResponse, status_code=201)
def duplicate_campaign(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    copy = svc.duplicate_campaign(db, campaign_id, current_user.id)
    if not copy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    db.commit()
    db.refresh(copy)
    return _campaign_to_response(db, copy)


# ---------------------------------------------------------------------------
# Campaign Products
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/products", response_model=list[CampaignProductResponse])
def list_products(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    return [_product_to_response(p) for p in svc.list_products(db, campaign_id)]


@router.post("/campaigns/{campaign_id}/products", response_model=CampaignProductResponse, status_code=201)
def add_product(
    campaign_id: str,
    body: CampaignProductCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    product = svc.add_product(db, campaign_id, body)
    db.commit()
    db.refresh(product)
    return _product_to_response(product)


@router.post("/campaigns/{campaign_id}/products/bulk-add", response_model=list[CampaignProductResponse], status_code=201)
def bulk_add_products(
    campaign_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Add products from the catalog by barcode list."""
    _require_campaign(db, campaign_id)
    barcodes = body.get("barcodes", [])
    products = svc.bulk_add_products(db, campaign_id, barcodes)
    db.commit()
    for p in products:
        db.refresh(p)
    return [_product_to_response(p) for p in products]


@router.post("/campaigns/{campaign_id}/products/import-pamphlet", response_model=list[CampaignProductResponse], status_code=201)
def import_products_from_pamphlet(
    campaign_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Copy all items from an existing pamphlet into this campaign as products."""
    from api.tools.pamphlets.service import get_pamphlet_items
    _require_campaign(db, campaign_id)
    pamphlet_id = body.get("pamphlet_id")
    if not pamphlet_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "pamphlet_id required")
    items = get_pamphlet_items(db, pamphlet_id)
    products = []
    for i, item in enumerate(items):
        p = svc.add_product(db, campaign_id, CampaignProductCreate(
            barcode=item.barcode,
            display_name=item.display_name,
            offer_price=float(item.offer_price) if item.offer_price is not None else None,
            original_price=float(item.original_price) if item.original_price is not None else None,
            highlight_text=item.highlight_text,
            image_url=item.image_url,
            sort_order=i,
        ))
        products.append(p)
    db.commit()
    for p in products:
        db.refresh(p)
    return [_product_to_response(p) for p in products]


@router.patch("/campaigns/{campaign_id}/products/{product_id}", response_model=CampaignProductResponse)
def update_product(
    campaign_id: str,
    product_id: str,
    body: CampaignProductUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    product = svc.update_product(db, product_id, body)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    db.commit()
    db.refresh(product)
    return _product_to_response(product)


@router.delete("/campaigns/{campaign_id}/products/{product_id}", status_code=204)
def remove_product(
    campaign_id: str,
    product_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    removed = svc.remove_product(db, product_id)
    if not removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    db.commit()


# ---------------------------------------------------------------------------
# Campaign Designs
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/designs", response_model=list[CampaignDesignSummary])
def list_designs(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    return [_design_to_summary(d) for d in svc.list_designs(db, campaign_id)]


@router.post("/campaigns/{campaign_id}/designs", response_model=CampaignDesignResponse, status_code=201)
def create_design(
    campaign_id: str,
    body: CampaignDesignCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    if body.target not in DESIGN_TARGETS:
        raise HTTPException(400, f"Unknown target. Valid: {DESIGN_TARGETS}")
    if body.target == "custom" and not (body.target_width_px and body.target_height_px):
        raise HTTPException(400, "custom target requires target_width_px and target_height_px")
    design = svc.create_design(db, campaign_id, body, current_user.id)
    db.commit()
    db.refresh(design)
    return _design_to_response(design)


@router.get("/campaigns/{campaign_id}/designs/{design_id}", response_model=CampaignDesignResponse)
def get_design(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")
    return _design_to_response(design)


@router.patch("/campaigns/{campaign_id}/designs/{design_id}", response_model=CampaignDesignResponse)
def update_design(
    campaign_id: str,
    design_id: str,
    body: CampaignDesignUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    design = svc.update_design(db, design_id, body)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")
    db.commit()
    db.refresh(design)
    return _design_to_response(design)


@router.delete("/campaigns/{campaign_id}/designs/{design_id}", status_code=204)
def delete_design(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")
    db.delete(design)
    db.commit()


@router.post("/campaigns/{campaign_id}/designs/{design_id}/duplicate", response_model=CampaignDesignResponse, status_code=201)
def duplicate_design(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    copy = svc.duplicate_design(db, design_id, current_user.id)
    if not copy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Design not found")
    db.commit()
    db.refresh(copy)
    return _design_to_response(copy)


# ---------------------------------------------------------------------------
# Design Versions
# ---------------------------------------------------------------------------

@router.get(
    "/campaigns/{campaign_id}/designs/{design_id}/versions",
    response_model=list[DesignVersionResponse],
)
def list_design_versions(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return [
        DesignVersionResponse(
            id=str(v.id), design_id=str(v.design_id),
            edit_summary=v.edit_summary, created_at=v.created_at,
            created_by=str(v.created_by) if v.created_by else None,
        )
        for v in svc.list_design_versions(db, design_id)
    ]


@router.post(
    "/campaigns/{campaign_id}/designs/{design_id}/versions/{version_id}/restore",
    response_model=DesignVersionResponse,
)
def restore_design_version(
    campaign_id: str,
    design_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    version = svc.restore_design_version(db, design_id, version_id, current_user.id)
    if not version:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    db.commit()
    return DesignVersionResponse(
        id=str(version.id), design_id=str(version.design_id),
        edit_summary=version.edit_summary, created_at=version.created_at,
        created_by=str(version.created_by) if version.created_by else None,
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/designs/{design_id}/chat")
def get_design_chat_history(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Return user+assistant messages for display in the chat UI."""
    from api.tools.campaign_studio.models import CampaignChatMessage
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(404, "Design not found")
    rows = (
        db.query(CampaignChatMessage)
        .filter(
            CampaignChatMessage.design_id == design_id,
            CampaignChatMessage.role.in_(["user", "assistant"]),
        )
        .order_by(CampaignChatMessage.created_at)
        .all()
    )
    return [{"role": r.role, "content": r.content or ""} for r in rows]


@router.delete("/campaigns/{campaign_id}/designs/{design_id}/chat")
def clear_design_chat(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Clear all chat history for this design (start a new session)."""
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(404, "Design not found")
    deleted = svc.clear_design_chat_history(db, design_id)
    return {"deleted": deleted}


@router.post("/campaigns/{campaign_id}/designs/{design_id}/chat", response_model=DesignChatResponse)
def chat_design(
    campaign_id: str,
    design_id: str,
    body: DesignChatRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """AI chat turn: modifies design DSL via tool calls and saves a version."""
    import copy
    import logging
    from sqlalchemy.orm.attributes import flag_modified
    from api.tools.campaign_studio.chat import make_campaign_chat_session
    from api.tools.pamphlets.render.html import render_pamphlet

    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(404, "Design not found")

    try:
        dsl = design.dsl or {}
        # Seed a valid page root so the AI always has a node tree to insert into.
        # Without this, apply_dsl_patch ops targeting "root" silently fail and the
        # AI falls back to creating its own root with the wrong type.
        if not dsl or not dsl.get("type"):
            import copy as _copy
            dsl = _copy.deepcopy({
                "type": "page",
                "id": "root",
                "children": [],
            })
        theme = design.theme or {}
        items = _build_items_lookup(db, campaign_id)
        # Cap history to last 30 messages — beyond this the AI loses track of rules
        history = svc.load_design_chat_history(db, design_id)[-30:]

        # Build a compact product list (with ids) for the system prompt
        raw_products = svc.list_products(db, campaign_id)
        products_for_prompt = [
            {
                "id": str(p.id),
                "display_name": p.display_name,
                "offer_price": float(p.offer_price) if p.offer_price else None,
                "original_price": float(p.original_price) if p.original_price else None,
                "highlight_text": p.highlight_text,
                "category": p.category,
            }
            for p in raw_products
        ]

        session, state = make_campaign_chat_session(
            dsl=dsl, theme=theme, items=items,
            design_title=design.title,
            design_type=design.design_type,
            target=design.target,
            products=products_for_prompt,
            history=history,
            provider=body.provider,
            model=body.model,
            db=db,
            design_id=design_id,
        )

        try:
            turn = session.send(body.message)
        except Exception as e:
            raise HTTPException(502, f"AI error: {e}")

        version = None
        render_error: str | None = None
        if state.dirty:
            # Validate DSL renders cleanly before persisting
            try:
                render_pamphlet(state.dsl, state.theme or {}, {})
            except Exception as err:
                render_error = str(err)
                logging.getLogger(__name__).warning(
                    "Chat produced invalid DSL for design %s, discarding: %s", design_id, err
                )
                state.dirty = False

        if state.dirty:
            version = svc.create_design_version(
                db, design_id, state.dsl, state.theme or {},
                parent_version_id=str(design.current_version_id) if design.current_version_id else None,
                user_id=current_user.id,
                edit_summary=_summarize_tools(turn),
            )
            design.dsl = copy.deepcopy(state.dsl)
            design.theme = copy.deepcopy(state.theme) if state.theme else None
            design.current_version_id = version.id
            flag_modified(design, "dsl")
            flag_modified(design, "theme")

        try:
            svc.save_design_chat_messages(
                db, design_id, turn.new_messages,
                version_id=str(version.id) if version else None,
                user_id=current_user.id,
                provider=turn.provider, model=turn.model,
                prompt_tokens=turn.prompt_tokens, completion_tokens=turn.completion_tokens,
                cost_usd=float(turn.cost_usd),
            )
            db.commit()
        except Exception as save_err:
            logging.getLogger(__name__).warning(
                "Chat history save failed for design %s (non-fatal): %s", design_id, save_err
            )
            db.rollback()

    except HTTPException:
        raise
    except BaseException as e:
        logging.getLogger(__name__).exception("Chat crashed for design %s", design_id)
        db.rollback()
        raise HTTPException(500, f"Chat error: {type(e).__name__}: {e}")

    # Append render error notice to assistant text so user sees it in chat
    assistant_text = turn.assistant_text or ""
    if render_error:
        assistant_text += f"\n\n⚠ Changes were discarded — render validation failed: {render_error}"

    # Collect any tool-level errors for display
    tool_errors = [
        f"• {e.tool_name}: {e.result.get('error', e.result)}"
        for e in turn.tool_executions
        if e.is_error or (isinstance(e.result, dict) and e.result.get("error"))
    ]
    if tool_errors:
        assistant_text += "\n\n⚠ Tool errors:\n" + "\n".join(tool_errors)

    return DesignChatResponse(
        assistant_text=assistant_text,
        tool_calls=[
            DesignToolCallInfo(tool_name=e.tool_name, args=e.args, result=e.result, is_error=e.is_error)
            for e in turn.tool_executions
        ],
        version_id=str(version.id) if version else None,
        dsl=state.dsl,
        theme=state.theme,
        cost_usd=float(turn.cost_usd),
        provider=turn.provider,
        model=turn.model,
    )


def _summarize_tools(turn) -> str:
    names = [e.tool_name for e in turn.tool_executions if not e.is_error]
    if not names:
        return "Chat (no changes)"
    unique = list(dict.fromkeys(names))
    return ", ".join(unique[:3]) + ("..." if len(unique) > 3 else "")


# ---------------------------------------------------------------------------
# Preview (live HTML render without saving)
# ---------------------------------------------------------------------------

@router.post("/campaigns/{campaign_id}/designs/{design_id}/preview")
def preview_design(
    campaign_id: str,
    design_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Render DSL → HTML. If body.dsl is absent, renders the saved DSL."""
    from fastapi.responses import HTMLResponse
    from api.tools.pamphlets.render.html import render_pamphlet

    dsl = body.get("dsl")
    theme = body.get("theme") or {}

    if dsl is None:
        design = svc.get_design(db, design_id)
        if not design or str(design.campaign_id) != campaign_id:
            raise HTTPException(404, "Design not found")
        dsl = design.dsl
        theme = design.theme or {}

    if not dsl:
        return HTMLResponse(
            "<html><body style='margin:0;display:flex;align-items:center;justify-content:center;"
            "height:300px;font-family:sans-serif;color:#9ca3af;font-size:0.875rem;'>"
            "No layout yet — use the chat or add nodes to build</body></html>"
        )

    items = _build_items_lookup(db, campaign_id)
    try:
        html = render_pamphlet(dsl, theme, items)
    except Exception as exc:
        return HTMLResponse(
            "<html><body style='margin:16px;font-family:monospace;color:#dc2626;'>"
            f"<b>Render error:</b><pre>{exc}</pre></body></html>"
        )
    return HTMLResponse(html)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/designs/{design_id}/export-pdf")
async def export_design_pdf(
    campaign_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    from fastapi.responses import Response as FR
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(404, "Design not found")
    if not design.dsl:
        raise HTTPException(400, "Design has no DSL — use chat to build layout first")

    from api.tools.pamphlets.render.html import render_pamphlet as render_html
    from api.tools.pamphlets.render.pdf import render_html_to_pdf
    items = _build_items_lookup(db, campaign_id)
    html = render_html(design.dsl, design.theme or {}, items)
    width_mm = float(design.dsl.get("width_mm", 297))
    height_mm = float(design.dsl.get("height_mm", 210))
    pdf_bytes = await render_html_to_pdf(html, width_mm=width_mm, height_mm=height_mm)
    return FR(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{design.title}.pdf"'},
    )


@router.get("/campaigns/{campaign_id}/designs/{design_id}/export-image")
async def export_design_image(
    campaign_id: str,
    design_id: str,
    scale: int = 2,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Export all pages as a single tall PNG. scale=2 (default) = 2×, scale=3 = print quality."""
    from fastapi.responses import Response as FR
    design = svc.get_design(db, design_id)
    if not design or str(design.campaign_id) != campaign_id:
        raise HTTPException(404, "Design not found")
    if not design.dsl:
        raise HTTPException(400, "Design has no DSL")

    scale = max(1, min(scale, 3))  # clamp 1–3
    from api.tools.pamphlets.render.html import render_pamphlet as render_html
    from api.tools.pamphlets.render.pdf import render_html_to_image
    items = _build_items_lookup(db, campaign_id)
    html = render_html(design.dsl, design.theme or {}, items)
    width_mm = float(design.dsl.get("width_mm", 297))
    height_mm = float(design.dsl.get("height_mm", 210))
    width_px = round(width_mm * 3.7795)
    height_px = round(height_mm * 3.7795)
    img_bytes = await render_html_to_image(html, scale=scale, width_px=width_px, height_px=height_px)
    return FR(
        content=img_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{design.title}.png"'},
    )


@router.post("/campaigns/{campaign_id}/export-as-pamphlet", status_code=201)
def export_as_pamphlet(
    campaign_id: str,
    body: ExportToPamphletRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    pamphlet = svc.export_design_as_pamphlet(
        db, campaign_id, body.design_id, current_user.id,
        pamphlet_title=body.pamphlet_title,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
    )
    if not pamphlet:
        raise HTTPException(404, "Design not found")
    db.commit()
    return {"pamphlet_id": str(pamphlet.id), "title": pamphlet.title}


# ---------------------------------------------------------------------------
# Per-campaign image upload
# ---------------------------------------------------------------------------

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/campaigns/{campaign_id}/assets/upload")
async def upload_campaign_asset(
    campaign_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Upload an image and store it as a campaign asset.

    Returns the serving URL relative to the API base, e.g.
    /uploads/campaign_assets/{filename}.
    """
    import re
    import uuid
    from pathlib import Path

    _require_campaign(db, campaign_id)

    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{file.content_type}'. Allowed: {', '.join(sorted(_ALLOWED_IMAGE_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File exceeds the 10 MB size limit",
        )

    # Sanitize original filename: keep alphanumeric, dots, dashes, underscores only
    original_name = file.filename or "upload"
    safe_original = re.sub(r"[^\w.\-]", "_", original_name)
    filename = f"{campaign_id}_{uuid.uuid4().hex[:8]}_{safe_original}"

    dest_dir = Path(__file__).parents[3] / "data" / "uploads" / "campaign_assets"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    dest_path.write_bytes(file_bytes)

    url = f"/uploads/campaign_assets/{filename}"
    return {"url": url, "filename": filename}


# ---------------------------------------------------------------------------
# Asset Library
# ---------------------------------------------------------------------------

@router.get("/assets", response_model=list[AssetLibraryResponse])
def list_asset_library(
    kind: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    q = db.query(AssetLibrary).order_by(AssetLibrary.created_at.desc())
    if kind:
        q = q.filter(AssetLibrary.kind == kind)
    return [_asset_lib_to_response(a) for a in q.all()]


@router.post("/assets/upload", response_model=AssetLibraryResponse, status_code=201)
async def upload_asset(
    kind: str = Query(...),
    alt: str = Query(default=""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if kind not in ASSET_KINDS:
        raise HTTPException(400, f"Unknown kind. Valid: {ASSET_KINDS}")
    asset_svc = get_asset_service()
    file_bytes = await file.read()
    url = await asset_svc.upload(
        file_bytes,
        filename=file.filename or "upload",
        kind=kind,
        content_type=file.content_type or "application/octet-stream",
    )
    from datetime import datetime, timezone
    import uuid
    asset = AssetLibrary(
        id=uuid.uuid4(),
        kind=kind,
        url=url,
        alt=alt or None,
        tags=[],
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _asset_lib_to_response(asset)


@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    asset = db.query(AssetLibrary).filter(AssetLibrary.id == asset_id).first()
    if not asset:
        raise HTTPException(404, "Asset not found")
    asset_svc = get_asset_service()
    await asset_svc.delete(asset.url)
    db.delete(asset)
    db.commit()


# ---------------------------------------------------------------------------
# Campaign Assets (per-campaign attachment)
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/assets", response_model=list[CampaignAssetResponse])
def list_campaign_assets(
    campaign_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    return [_campaign_asset_to_response(a) for a in svc.list_assets(db, campaign_id)]


@router.post("/campaigns/{campaign_id}/assets", response_model=CampaignAssetResponse, status_code=201)
def add_campaign_asset(
    campaign_id: str,
    body: CampaignAssetCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    _require_campaign(db, campaign_id)
    asset = svc.add_asset(db, campaign_id, body)
    db.commit()
    db.refresh(asset)
    return _campaign_asset_to_response(asset)


@router.delete("/campaigns/{campaign_id}/assets/{asset_id}", status_code=204)
def remove_campaign_asset(
    campaign_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    removed = svc.remove_asset(db, asset_id)
    if not removed:
        raise HTTPException(404, "Asset not found")
    db.commit()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _require_campaign(db: Session, campaign_id: str):
    if not svc.get_campaign(db, campaign_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")


def _campaign_to_response(db: Session, campaign) -> CampaignResponse:
    from api.tools.campaign_studio.models import CampaignProduct, CampaignDesign
    pc = db.query(CampaignProduct).filter(CampaignProduct.campaign_id == campaign.id).count()
    dc = db.query(CampaignDesign).filter(CampaignDesign.campaign_id == campaign.id).count()
    return CampaignResponse(
        id=str(campaign.id),
        title=campaign.title,
        campaign_type=campaign.campaign_type,
        objective=campaign.objective,
        audience=campaign.audience,
        theme_id=campaign.theme_id,
        channels=campaign.channels or [],
        status=campaign.status,
        created_at=campaign.created_at,
        valid_from=campaign.valid_from,
        valid_until=campaign.valid_until,
        metadata=campaign.metadata_,
        product_count=pc,
        design_count=dc,
    )


def _product_to_response(p) -> CampaignProductResponse:
    return CampaignProductResponse(
        id=str(p.id), campaign_id=str(p.campaign_id),
        barcode=p.barcode, display_name=p.display_name,
        priority=p.priority, role=p.role, sort_order=p.sort_order,
        offer_price=float(p.offer_price) if p.offer_price is not None else None,
        original_price=float(p.original_price) if p.original_price is not None else None,
        highlight_text=p.highlight_text, image_url=p.image_url,
        category=p.category, unit=p.unit,
    )


def _design_to_response(d) -> CampaignDesignResponse:
    return CampaignDesignResponse(
        id=str(d.id), campaign_id=str(d.campaign_id),
        title=d.title, design_type=d.design_type, target=d.target,
        target_width_px=d.target_width_px, target_height_px=d.target_height_px,
        dsl=d.dsl, theme=d.theme,
        current_version_id=str(d.current_version_id) if d.current_version_id else None,
        version_retention=d.version_retention, status=d.status,
        created_at=d.created_at,
    )


def _design_to_summary(d) -> CampaignDesignSummary:
    return CampaignDesignSummary(
        id=str(d.id), campaign_id=str(d.campaign_id),
        title=d.title, design_type=d.design_type,
        target=d.target, status=d.status, created_at=d.created_at,
    )


def _asset_lib_to_response(a) -> AssetLibraryResponse:
    return AssetLibraryResponse(
        id=str(a.id), kind=a.kind, url=a.url, alt=a.alt,
        tags=a.tags or [], metadata=a.metadata_,
        created_at=a.created_at,
    )


def _campaign_asset_to_response(a) -> CampaignAssetResponse:
    return CampaignAssetResponse(
        id=str(a.id), campaign_id=str(a.campaign_id),
        asset_library_id=str(a.asset_library_id) if a.asset_library_id else None,
        kind=a.kind, url=a.url, alt=a.alt, metadata=a.metadata_,
    )


def _build_items_lookup(db: Session, campaign_id: str) -> dict:
    products = svc.list_products(db, campaign_id)
    return {
        str(p.id): {
            "display_name": p.display_name,
            "offer_price": float(p.offer_price) if p.offer_price else None,
            "original_price": float(p.original_price) if p.original_price else None,
            "highlight_text": p.highlight_text,
            "image_url": p.image_url,
            "barcode": p.barcode,
            "category": p.category,
            "unit": p.unit,
        }
        for p in products
    }
