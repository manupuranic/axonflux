from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.dependencies import get_conn, get_db, require_staff
from api.schemas.auth import CurrentUser
from api.tools.bom import MANIFEST
from api.tools.bom.schemas import (
    BomMapping,
    BomSuggestionGroup,
    ConfirmBomRequest,
    ManualBomRequest,
    RejectBomRequest,
    UpdateBomRequest,
)

router = APIRouter(prefix=f"/api/tools/{MANIFEST.id}", tags=[MANIFEST.name])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PRODUCT_NAME_SQL = """
    SELECT MAX(item_name_raw) AS name
    FROM (
        SELECT item_name_raw FROM raw.raw_sales_itemwise WHERE barcode = :bc
        UNION ALL
        SELECT item_name_raw FROM raw.raw_purchase_itemwise WHERE barcode = :bc
    ) t
"""


def _resolve_name(conn: Connection, barcode: str) -> str | None:
    row = conn.execute(text(_PRODUCT_NAME_SQL), {"bc": barcode}).scalar()
    return row


# ---------------------------------------------------------------------------
# Suggestions — grouped by raw material
# ---------------------------------------------------------------------------

@router.get("/suggestions", response_model=list[BomSuggestionGroup])
def get_suggestions(
    suggestion_status: str = Query("pending", alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(require_staff),
):
    rows = conn.execute(text("""
        SELECT id::TEXT AS id, raw_barcode, raw_name, finished_barcode, finished_name,
               similarity_score, status
        FROM app.product_bom_suggestions
        WHERE status = :status
        ORDER BY raw_barcode, similarity_score DESC
        LIMIT :limit OFFSET :offset
    """), {"status": suggestion_status, "limit": limit, "offset": offset}).mappings().all()

    groups: dict[str, dict] = {}
    for r in rows:
        key = r["raw_barcode"]
        if key not in groups:
            groups[key] = {
                "raw_barcode": key,
                "raw_name": r["raw_name"],
                "suggestions": [],
                "max_score": 0.0,
            }
        groups[key]["suggestions"].append(dict(r))
        groups[key]["max_score"] = max(groups[key]["max_score"], float(r["similarity_score"]))

    return [BomSuggestionGroup(**g) for g in groups.values()]


# ---------------------------------------------------------------------------
# Confirm suggestion (qty entry = confirmation gate)
# ---------------------------------------------------------------------------

@router.post("/confirm", response_model=BomMapping)
def confirm_bom(
    body: ConfirmBomRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_staff),
):
    if body.qty_per_unit <= 0:
        raise HTTPException(status_code=422, detail="qty_per_unit must be > 0")

    raw_name      = _resolve_name(db.connection(), body.raw_barcode)
    finished_name = _resolve_name(db.connection(), body.finished_barcode)

    existing = db.execute(text("""
        SELECT id FROM app.product_bom
        WHERE raw_barcode = :r AND finished_barcode = :f
    """), {"r": body.raw_barcode, "f": body.finished_barcode}).scalar()

    if existing:
        raise HTTPException(status_code=409, detail="BOM mapping already exists")

    row = db.execute(text("""
        INSERT INTO app.product_bom
            (raw_barcode, finished_barcode, qty_per_unit, notes, confirmed_by, confirmed_at)
        VALUES
            (:r, :f, :qty, :notes, :user_id, NOW())
        RETURNING id, raw_barcode, finished_barcode, qty_per_unit, notes, confirmed_at
    """), {
        "r": body.raw_barcode,
        "f": body.finished_barcode,
        "qty": body.qty_per_unit,
        "notes": body.notes,
        "user_id": str(current_user.id),
    }).mappings().one()

    if body.suggestion_id:
        db.execute(text("""
            UPDATE app.product_bom_suggestions
            SET status = 'confirmed'
            WHERE id = :sid
        """), {"sid": body.suggestion_id})

    db.commit()

    return BomMapping(
        id=str(row["id"]),
        raw_barcode=row["raw_barcode"],
        raw_name=raw_name,
        finished_barcode=row["finished_barcode"],
        finished_name=finished_name,
        qty_per_unit=float(row["qty_per_unit"]),
        notes=row["notes"],
        confirmed_at=row["confirmed_at"],
    )


# ---------------------------------------------------------------------------
# Reject suggestion
# ---------------------------------------------------------------------------

@router.post("/reject", status_code=status.HTTP_200_OK)
def reject_suggestion(
    body: RejectBomRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    updated = db.execute(text("""
        UPDATE app.product_bom_suggestions
        SET status = 'rejected'
        WHERE id = :sid AND status = 'pending'
        RETURNING id
    """), {"sid": body.suggestion_id}).scalar()
    db.commit()
    if not updated:
        raise HTTPException(status_code=404, detail="Suggestion not found or already actioned")
    return {"ok": True}


# ---------------------------------------------------------------------------
# List confirmed mappings
# ---------------------------------------------------------------------------

@router.get("/mappings", response_model=list[BomMapping])
def list_mappings(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(require_staff),
):
    rows = conn.execute(text("""
        SELECT
            b.id::TEXT,
            b.raw_barcode,
            b.finished_barcode,
            b.qty_per_unit,
            b.notes,
            b.confirmed_at,
            rn.raw_name,
            fn.finished_name
        FROM app.product_bom b
        LEFT JOIN LATERAL (
            SELECT MAX(item_name_raw) AS raw_name
            FROM (
                SELECT item_name_raw FROM raw.raw_sales_itemwise  WHERE barcode = b.raw_barcode
                UNION ALL
                SELECT item_name_raw FROM raw.raw_purchase_itemwise WHERE barcode = b.raw_barcode
            ) t
        ) rn ON TRUE
        LEFT JOIN LATERAL (
            SELECT MAX(item_name_raw) AS finished_name
            FROM (
                SELECT item_name_raw FROM raw.raw_sales_itemwise  WHERE barcode = b.finished_barcode
                UNION ALL
                SELECT item_name_raw FROM raw.raw_purchase_itemwise WHERE barcode = b.finished_barcode
            ) t
        ) fn ON TRUE
        ORDER BY b.confirmed_at DESC
        LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": offset}).mappings().all()

    return [BomMapping(
        id=r["id"],
        raw_barcode=r["raw_barcode"],
        raw_name=r["raw_name"],
        finished_barcode=r["finished_barcode"],
        finished_name=r["finished_name"],
        qty_per_unit=float(r["qty_per_unit"]),
        notes=r["notes"],
        confirmed_at=r["confirmed_at"],
    ) for r in rows]


# ---------------------------------------------------------------------------
# Update mapping
# ---------------------------------------------------------------------------

@router.patch("/mappings/{mapping_id}", response_model=BomMapping)
def update_mapping(
    mapping_id: str,
    body: UpdateBomRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    if body.qty_per_unit is not None and body.qty_per_unit <= 0:
        raise HTTPException(status_code=422, detail="qty_per_unit must be > 0")

    sets = []
    params: dict = {"id": mapping_id}
    if body.qty_per_unit is not None:
        sets.append("qty_per_unit = :qty")
        params["qty"] = body.qty_per_unit
    if body.notes is not None:
        sets.append("notes = :notes")
        params["notes"] = body.notes
    if not sets:
        raise HTTPException(status_code=422, detail="Nothing to update")

    row = db.execute(text(f"""
        UPDATE app.product_bom SET {', '.join(sets)}
        WHERE id = :id::UUID
        RETURNING id::TEXT, raw_barcode, finished_barcode, qty_per_unit, notes, confirmed_at
    """), params).mappings().one_or_none()
    db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")

    return BomMapping(
        id=row["id"],
        raw_barcode=row["raw_barcode"],
        raw_name=_resolve_name(db.connection(), row["raw_barcode"]),
        finished_barcode=row["finished_barcode"],
        finished_name=_resolve_name(db.connection(), row["finished_barcode"]),
        qty_per_unit=float(row["qty_per_unit"]),
        notes=row["notes"],
        confirmed_at=row["confirmed_at"],
    )


# ---------------------------------------------------------------------------
# Delete mapping
# ---------------------------------------------------------------------------

@router.delete("/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mapping(
    mapping_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_staff),
):
    deleted = db.execute(text("""
        DELETE FROM app.product_bom WHERE id = :id::UUID RETURNING id
    """), {"id": mapping_id}).scalar()
    db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping not found")


# ---------------------------------------------------------------------------
# Manual BOM creation (no suggestion required)
# ---------------------------------------------------------------------------

@router.post("/manual", response_model=BomMapping, status_code=status.HTTP_201_CREATED)
def create_manual_bom(
    body: ManualBomRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_staff),
):
    return confirm_bom(
        ConfirmBomRequest(
            raw_barcode=body.raw_barcode,
            finished_barcode=body.finished_barcode,
            qty_per_unit=body.qty_per_unit,
            notes=body.notes,
        ),
        db=db,
        current_user=current_user,
    )


# ---------------------------------------------------------------------------
# Product search (for manual BOM creation)
# ---------------------------------------------------------------------------

@router.get("/product-search")
def product_search(
    q: str = Query(min_length=2, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(require_staff),
):
    rows = conn.execute(text("""
        SELECT barcode, MAX(item_name_raw) AS item_name
        FROM (
            SELECT barcode, item_name_raw FROM raw.raw_sales_itemwise
            UNION ALL
            SELECT barcode, item_name_raw FROM raw.raw_purchase_itemwise
        ) t
        WHERE item_name_raw ILIKE :q
        GROUP BY barcode
        ORDER BY MAX(item_name_raw)
        LIMIT :limit
    """), {"q": f"%{q}%", "limit": limit}).mappings().all()
    return [{"barcode": r["barcode"], "item_name": r["item_name"]} for r in rows]
