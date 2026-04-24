import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.dependencies import get_conn, get_current_user, get_db, require_admin
from api.schemas.auth import CurrentUser
from api.tools.entity_resolution import MANIFEST
from api.tools.entity_resolution import service
from api.tools.entity_resolution.schemas import (
    AliasResponse,
    ConfirmRequest,
    ConfirmResponse,
    ProductDetail,
    RejectRequest,
    SuggestionCluster,
)

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

@router.get("/suggestions", response_model=list[SuggestionCluster])
def get_suggestions(
    suggestion_status: str = Query("pending", alias="status"),
    min_score: float | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    return service.get_suggestions(conn, suggestion_status, min_score, limit, offset)


# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------

@router.post("/confirm", response_model=ConfirmResponse)
def confirm_alias(
    body: ConfirmRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    alias = service.confirm_alias(db, body, current_user)
    return ConfirmResponse(alias=alias, pipeline_rebuild_required=True)


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

@router.post("/reject", status_code=status.HTTP_200_OK)
def reject_suggestion(
    body: RejectRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    service.reject_suggestion(db, body.suggestion_id, current_user)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Aliases list
# ---------------------------------------------------------------------------

@router.get("/aliases")
def list_aliases(
    canonical_barcode: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    return service.list_aliases(conn, canonical_barcode, limit, offset)


# ---------------------------------------------------------------------------
# Delete alias (admin only)
# ---------------------------------------------------------------------------

@router.delete("/aliases/{alias_barcode}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alias(
    alias_barcode: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    service.delete_alias(db, alias_barcode)


# ---------------------------------------------------------------------------
# Product detail (hover preview)
# ---------------------------------------------------------------------------

@router.get("/product/{barcode}", response_model=ProductDetail | None)
def get_product_detail(
    barcode: str,
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    detail = service.get_product_detail(conn, barcode)
    if detail is None:
        from fastapi import HTTPException as HE
        raise HE(status_code=404, detail="Barcode not found")
    return detail


# ---------------------------------------------------------------------------
# Recompute suggestions (admin only — runs clustering script as subprocess)
# ---------------------------------------------------------------------------

@router.post("/recompute")
def recompute_suggestions(
    min_score: int = Query(78, ge=50, le=95),
    _: CurrentUser = Depends(require_admin),
):
    cmd = [
        sys.executable,
        str(_PROJECT_ROOT / "scripts" / "cluster_product_names.py"),
        "--min-score", str(min_score),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(_PROJECT_ROOT)
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(_PROJECT_ROOT),
        env=env,
        timeout=300,
    )
    if result.returncode != 0:
        return {
            "status": "error",
            "message": f"Clustering script failed (exit code {result.returncode})",
            "output": (result.stdout or "") + (result.stderr or ""),
        }
    return {
        "status": "completed",
        "message": f"Clustering complete (min_score={min_score}).",
        "output": result.stdout or "",
    }
