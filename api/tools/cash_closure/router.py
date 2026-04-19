from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from api.dependencies import get_db, get_current_user, require_admin
from api.schemas.auth import CurrentUser
from api.tools.cash_closure import MANIFEST
from api.tools.cash_closure.schemas import HotoCreate, HotoResponse, HotoVerify
from api.tools.cash_closure import service

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)


def _to_response(record) -> HotoResponse:
    def to_float(v):
        return float(v) if v is not None else None

    def to_items(raw) -> list:
        if not raw:
            return []
        return [{"description": item.get("description", ""), "amount": float(item.get("amount", 0))} for item in raw]

    def to_denoms(raw) -> dict:
        if not raw:
            return {}
        return {k: int(v) for k, v in raw.items()}

    return HotoResponse(
        id=str(record.id),
        closure_date=record.closure_date,
        status=record.status,
        submitted_at=record.submitted_at,
        opening_cash=to_float(record.opening_cash),
        net_sales=to_float(record.net_sales),
        sodexo_collection=to_float(record.sodexo_collection),
        manual_billings=to_items(record.manual_billings),
        old_balance_collections=to_items(record.old_balance_collections),
        distributor_expiry=to_float(record.distributor_expiry),
        oil_crush=to_float(record.oil_crush),
        other_income=to_float(record.other_income),
        pluxee_amount=to_float(record.pluxee_amount),
        paytm_amount=to_float(record.paytm_amount),
        phonepe_amount=to_float(record.phonepe_amount),
        card_amount=to_float(record.card_amount),
        credits_given=to_items(record.credits_given),
        returns_amount=to_float(record.returns_amount),
        expenses=to_items(record.expenses),
        physical_cash_counted=to_float(record.physical_cash_counted),
        denominations_opening=to_denoms(record.denominations_opening),
        denominations_sales=to_denoms(record.denominations_sales),
        total_inside_counter=to_float(record.total_inside_counter),
        total_outside_counter=to_float(record.total_outside_counter),
        expected_cash=to_float(record.expected_cash),
        difference_amount=to_float(record.difference_amount),
        notes=record.notes,
    )


@router.post("", response_model=HotoResponse, status_code=201)
def submit_closure(
    body: HotoCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Submit the HOTO for a given date. Upserts — re-submitting an existing draft is allowed."""
    record = service.upsert_closure(db, body, str(current_user.id))
    db.commit()
    db.refresh(record)
    return _to_response(record)


@router.put("/draft", response_model=HotoResponse, status_code=200)
def save_draft(
    body: HotoCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Save a draft without marking as submitted. Safe to call repeatedly."""
    record = service.save_draft(db, body, str(current_user.id))
    db.commit()
    db.refresh(record)
    return _to_response(record)


@router.get("/date/{closure_date}", response_model=HotoResponse)
def get_by_date(
    closure_date: date,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Fetch the HOTO record for a specific date. Used to pre-fill today's form."""
    record = service.get_closure_by_date(db, closure_date)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No HOTO for this date")
    return _to_response(record)


@router.get("", response_model=dict)
def list_closures(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    total, items = service.list_closures(db, limit, offset)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_to_response(r) for r in items],
    }


@router.get("/{closure_id}", response_model=HotoResponse)
def get_closure(
    closure_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    record = service.get_closure(db, closure_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Closure not found")
    return _to_response(record)


@router.patch("/{closure_id}/verify", response_model=HotoResponse)
def verify_closure(
    closure_id: str,
    body: HotoVerify,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    record = service.verify_closure(db, closure_id, str(current_user.id), body.status, body.notes)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Closure not found")
    db.commit()
    db.refresh(record)
    return _to_response(record)
