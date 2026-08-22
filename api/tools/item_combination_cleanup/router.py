import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from sqlalchemy.engine import Connection

from api.dependencies import get_conn, get_db, require_staff
from api.schemas.auth import CurrentUser
from api.tools.item_combination_cleanup import MANIFEST
from api.tools.item_combination_cleanup.models import ItemCombinationCleanupRun
from api.tools.item_combination_cleanup.schemas import (
    CleanupRowListResponse,
    CleanupRowOut,
    CleanupRunResponse,
    CleanupApprovalRequest,
    CleanupBulkApprovalRequest,
    CleanupBulkApprovalResponse,
    CleanupBulkDecisionRequest,
    CleanupFieldDecisionRequest,
    CleanupStaffExportRequest,
)
from api.tools.item_combination_cleanup import service

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)


def _to_response(run: ItemCombinationCleanupRun) -> CleanupRunResponse:
    return CleanupRunResponse(
        id=str(run.id),
        status=run.status,
        source_file_name=run.source_file_name,
        sheet_name=run.sheet_name,
        header_row=run.header_row,
        row_count=run.row_count,
        column_count=run.column_count,
        headers=list(run.headers) if run.headers is not None else None,
        summary=run.summary_json if getattr(run, "summary_json", None) else None,
        validation_status=run.validation_status,
        error_message=run.error_message,
        created_at=run.created_at,
        has_output=bool(run.output_path),
        has_approved_output=bool(run.approved_output_path),
    )


@router.post("/runs", response_model=CleanupRunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_staff),
):
    content = await file.read()
    try:
        run = service.create_run(
            db,
            filename=file.filename,
            content=content,
            content_type=file.content_type,
            user=user,
        )
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _to_response(run)


@router.get("/runs", response_model=list[CleanupRunResponse])
def list_runs(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    return [_to_response(run) for run in service.list_runs(db, limit)]


@router.get("/runs/{run_id}", response_model=CleanupRunResponse)
def get_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_response(run)


@router.post("/runs/{run_id}/process", response_model=CleanupRunResponse)
def process_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        run = service.process_run(db, conn, run)
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _to_response(run)


@router.post("/runs/{run_id}/export", response_model=CleanupRunResponse)
def export_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        run = service.export_run(db, run)
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _to_response(run)


@router.get("/runs/{run_id}/download")
def download_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None or not run.output_path:
        raise HTTPException(status_code=404, detail="Verified output is not available")
    path = Path(run.output_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Verified output is not available")
    download_name = Path(run.source_file_name).stem + "_verified.xlsx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name,
    )


@router.get("/runs/{run_id}/rows", response_model=CleanupRowListResponse)
def list_rows(
    run_id: uuid.UUID,
    type: str | None = Query(None),
    status: str | None = Query(None),
    confidence: str | None = Query(None),
    q: str | None = Query(None),
    brand_changed: bool | None = Query(None),
    name_changed: bool | None = Query(None),
    size_changed: bool | None = Query(None),
    approval_status: str | None = Query(None),
    semantic_relationship: str | None = Query(None),
    semantic_confidence: str | None = Query(None),
    semantic_disagreement: bool | None = Query(None),
    semantic_sample: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    total, rows, stats = service.list_rows(
        db,
        run_id,
        product_type=type,
        review_status=status,
        confidence=confidence,
        q=q,
        brand_changed=brand_changed,
        name_changed=name_changed,
        size_changed=size_changed,
        approval_status=approval_status,
        semantic_relationship=semantic_relationship,
        semantic_confidence=semantic_confidence,
        semantic_disagreement=semantic_disagreement,
        semantic_sample=semantic_sample,
        limit=limit,
        offset=offset,
    )
    semantic_by_item = service.semantic_assessment_map(db, run_id)
    return CleanupRowListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[CleanupRowOut(**service.attach_field_decisions(db, service.attach_semantic_assessment(service._row_out(row), semantic_by_item.get(row.item_id_key)), run_id)) for row in rows],
        stats=stats,
    )


@router.post("/runs/{run_id}/rows/{item_id}/approval", response_model=CleanupRowOut)
def approve_row(run_id: uuid.UUID, item_id: str, payload: CleanupApprovalRequest, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    row = service.get_row(db, run_id, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Proposal row not found")
    service.set_approval(row, payload.status, user)
    db.flush()
    assessment = service.semantic_assessment_map(db, run_id).get(row.item_id_key)
    return CleanupRowOut(**service.attach_field_decisions(db, service.attach_semantic_assessment(service._row_out(row), assessment), run_id))


@router.post("/runs/{run_id}/rows/{item_id}/fields/{field_name}")
def decide_field(run_id: uuid.UUID, item_id: str, field_name: str, payload: CleanupFieldDecisionRequest, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    row = service.get_row(db, run_id, item_id)
    if row is None: raise HTTPException(status_code=404, detail="Proposal row not found")
    try:
        record = service.set_field_decision(db, row, field_name, payload.decision, user, payload.edited_value)
        db.commit()
        return {"field": record.field_name, "decision": record.decision, "edited_value": record.edited_value, "row_complete": False, "approval_status": row.approval_status}
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/runs/{run_id}/rows/{item_id}/finalize-field-decisions")
def finalize_field_decisions(run_id: uuid.UUID, item_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    row = service.get_row(db, run_id, item_id)
    if row is None: raise HTTPException(status_code=404, detail="Proposal row not found")
    try:
        service.finalize_individual_field_decisions(db, row, user); db.commit()
        return {"approval_status": row.approval_status}
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/runs/{run_id}/bulk-approval", response_model=CleanupBulkApprovalResponse)
def bulk_approval(run_id: uuid.UUID, payload: CleanupBulkApprovalRequest, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    filters = {"product_type": payload.type, "review_status": payload.status, "confidence": payload.confidence, "q": payload.q, "brand_changed": payload.brand_changed, "name_changed": payload.name_changed, "size_changed": payload.size_changed}
    try:
        return CleanupBulkApprovalResponse(updated=service.bulk_approve(db, run_id, filters, user))
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/runs/{run_id}/bulk-decision")
def bulk_decision(run_id: uuid.UUID, payload: CleanupBulkDecisionRequest, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    try:
        updated, summary = service.bulk_decide(db, run_id, payload.status, user, payload.item_ids, {"type": payload.type, "confidence": payload.confidence, "supplier_match_method": payload.supplier_match_method, "semantic_relationship": payload.semantic_relationship, "semantic_confidence": payload.semantic_confidence, "semantic_disagreement": payload.semantic_disagreement})
        return {"updated": updated, "summary": summary}
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/runs/{run_id}/ai-supported-packed-pending-count")
def ai_supported_packed_pending_count(run_id: uuid.UUID, db: Session = Depends(get_db), _: CurrentUser = Depends(require_staff)):
    return {"count": service.ai_supported_packed_pending_count(db, run_id)}


@router.post("/runs/{run_id}/approve-ai-supported-packed")
def approve_ai_supported_packed(run_id: uuid.UUID, db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    updated, summary = service.bulk_decide(db, run_id, "APPROVED", user, [], {"type": "PACKED", "semantic_relationship": "LIKELY_PACKED_VERSION"})
    return {"updated": updated, "summary": summary}


@router.post("/runs/{run_id}/approved-export", response_model=CleanupRunResponse)
def approved_export(run_id: uuid.UUID, db: Session = Depends(get_db), _: CurrentUser = Depends(require_staff)):
    run = service.get_run(db, run_id)
    if run is None: raise HTTPException(status_code=404, detail="Run not found")
    try: return _to_response(service.export_approved_run(db, run))
    except service.CleanupServiceError as exc: raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/runs/{run_id}/approved-download")
def approved_download(run_id: uuid.UUID, db: Session = Depends(get_db), _: CurrentUser = Depends(require_staff)):
    run = service.get_run(db, run_id)
    path = Path(run.approved_output_path) if run and run.approved_output_path else None
    if path is None or not path.is_file(): raise HTTPException(status_code=404, detail="Approved export is not available")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=Path(run.source_file_name).stem + "_approved.xlsx")


@router.get("/runs/{run_id}/rows/{item_id}", response_model=CleanupRowOut)
def get_row(
    run_id: uuid.UUID,
    item_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    row = service.get_row(db, run_id, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Proposal row not found")
    assessment = service.semantic_assessment_map(db, run_id).get(row.item_id_key)
    return CleanupRowOut(**service.attach_semantic_assessment(service._row_out(row), assessment))


@router.post("/runs/{run_id}/proposals-export")
def export_proposals(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    run = service.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    source = Path(run.original_path)
    source_mtime = source.stat().st_mtime if source.is_file() else None
    try:
        path = service.export_proposals_audit(db, run)
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if source_mtime is not None and source.stat().st_mtime != source_mtime:
        raise HTTPException(status_code=500, detail="Source workbook was modified during audit export")
    download_name = Path(run.source_file_name).stem + "_proposals_audit.xlsx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name,
    )


@router.post("/runs/{run_id}/staff-review-export")
def staff_review_export(run_id: uuid.UUID, payload: CleanupStaffExportRequest, db: Session = Depends(get_db), _: CurrentUser = Depends(require_staff)):
    run = service.get_run(db, run_id)
    if run is None: raise HTTPException(status_code=404, detail="Run not found")
    path = service.export_staff_review(db, run, payload.item_ids, payload.packed_only)
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=Path(run.source_file_name).stem + "_staff_review.xlsx")


@router.post("/runs/{run_id}/staff-review-import-preview")
async def staff_review_import_preview(run_id: uuid.UUID, file: UploadFile = File(...), db: Session = Depends(get_db), _: CurrentUser = Depends(require_staff)):
    run = service.get_run(db, run_id)
    if run is None: raise HTTPException(status_code=404, detail="Run not found")
    try:
        return service.preview_staff_review_import(db, run, await file.read())
    except service.CleanupServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/runs/{run_id}/staff-review-import-apply")
async def staff_review_import_apply(run_id: uuid.UUID, preview_hash: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db), user: CurrentUser = Depends(require_staff)):
    run = service.get_run(db, run_id)
    if run is None: raise HTTPException(status_code=404, detail="Run not found")
    try:
        result = service.apply_staff_review_import(db, run, await file.read(), preview_hash, user); db.commit(); return result
    except service.CleanupServiceError as exc:
        db.rollback(); raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
