from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.dependencies import get_conn, get_db, get_current_user, require_admin
from api.schemas.auth import CurrentUser
from api.tools.cash_closure import MANIFEST
from api.tools.cash_closure.schemas import (
    CashClosureCreate,
    CashClosureResponse,
    CashClosureVerify,
    SystemTotals,
)
from api.tools.cash_closure import service

router = APIRouter(
    prefix=f"/api/tools/{MANIFEST.id}",
    tags=[MANIFEST.name],
)


@router.get("/system-totals", response_model=SystemTotals)
def get_system_totals(
    closure_date: date = Query(default=None),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    target = closure_date or date.today()
    return service.get_system_totals(conn, target)


@router.post("", response_model=CashClosureResponse, status_code=201)
def create_closure(
    body: CashClosureCreate,
    db: Session = Depends(get_db),
    conn: Connection = Depends(get_conn),
    current_user: CurrentUser = Depends(get_current_user),
):
    record = service.create_closure(db, conn, body, current_user.id)
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


@router.get("/{closure_id}", response_model=CashClosureResponse)
def get_closure(
    closure_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    record = service.get_closure(db, closure_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Closure not found")
    return _to_response(record)


@router.patch("/{closure_id}/verify", response_model=CashClosureResponse)
def verify_closure(
    closure_id: str,
    body: CashClosureVerify,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    record = service.verify_closure(db, closure_id, current_user.id, body.status, body.notes)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Closure not found")
    return _to_response(record)


def _to_response(record) -> CashClosureResponse:
    delta_cash = None
    delta_card = None
    delta_upi = None

    if record.physical_cash is not None and record.system_cash is not None:
        delta_cash = float(record.physical_cash) - float(record.system_cash)
    if record.card_total is not None and record.system_card is not None:
        delta_card = float(record.card_total) - float(record.system_card)

    staff_upi = sum(float(v) for v in [record.upi_googlepay, record.upi_phonepe, record.upi_paytm] if v is not None)
    sys_upi = sum(float(v) for v in [record.system_googlepay, record.system_phonepe, record.system_paytm] if v is not None)
    if staff_upi or sys_upi:
        delta_upi = staff_upi - sys_upi

    return CashClosureResponse(
        id=str(record.id),
        closure_date=record.closure_date,
        status=record.status,
        submitted_at=record.submitted_at,
        physical_cash=float(record.physical_cash) if record.physical_cash is not None else None,
        card_total=float(record.card_total) if record.card_total is not None else None,
        upi_googlepay=float(record.upi_googlepay) if record.upi_googlepay is not None else None,
        upi_phonepe=float(record.upi_phonepe) if record.upi_phonepe is not None else None,
        upi_paytm=float(record.upi_paytm) if record.upi_paytm is not None else None,
        system_cash=float(record.system_cash) if record.system_cash is not None else None,
        system_card=float(record.system_card) if record.system_card is not None else None,
        system_googlepay=float(record.system_googlepay) if record.system_googlepay is not None else None,
        system_phonepe=float(record.system_phonepe) if record.system_phonepe is not None else None,
        system_paytm=float(record.system_paytm) if record.system_paytm is not None else None,
        system_net_total=float(record.system_net_total) if record.system_net_total is not None else None,
        delta_cash=delta_cash,
        delta_card=delta_card,
        delta_upi=delta_upi,
        notes=record.notes,
    )
