from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from api.tools.cash_closure.models import CashClosureRecord
from api.tools.cash_closure.schemas import HotoCreate


def _sum_items(items: list) -> float:
    """Sum the amount field across a list of LineItem-like dicts."""
    return sum(float(item.get("amount", 0) if isinstance(item, dict) else item.amount) for item in items)


def _n(v) -> float:
    """Coerce None to 0.0 for arithmetic."""
    return float(v) if v is not None else 0.0


def compute_totals(body: HotoCreate) -> dict:
    """
    Replicates the Inside / Outside reconciliation from the HOTO Excel.

    Inside Counter  = opening_cash + net_sales + sodexo + sum(manual_billings)
                    + sum(old_balance_collections) + distributor_expiry
                    + oil_crush + other_income

    Outside Counter = pluxee + paytm + phonepe + card + sum(credits_given)
                    + returns + sum(expenses)

    Expected Cash   = Inside − Outside
    Difference      = physical_cash_counted − expected_cash
    """
    inside = (
        _n(body.opening_cash)
        + _n(body.net_sales)
        + _n(body.sodexo_collection)
        + _sum_items(body.manual_billings)
        + _sum_items(body.old_balance_collections)
        + _n(body.distributor_expiry)
        + _n(body.oil_crush)
        + _n(body.other_income)
    )

    outside = (
        _n(body.pluxee_amount)
        + _n(body.paytm_amount)
        + _n(body.phonepe_amount)
        + _n(body.card_amount)
        + _sum_items(body.credits_given)
        + _n(body.returns_amount)
        + _sum_items(body.expenses)
    )

    expected = inside - outside

    difference = (
        _n(body.physical_cash_counted) - expected
        if body.physical_cash_counted is not None
        else None
    )

    return {
        "total_inside_counter": round(inside, 2),
        "total_outside_counter": round(outside, 2),
        "expected_cash": round(expected, 2),
        "difference_amount": round(difference, 2) if difference is not None else None,
    }


def _items_to_dict(items) -> list[dict]:
    """Convert list of LineItem or dict to plain dicts for JSONB storage."""
    result = []
    for item in items:
        if isinstance(item, dict):
            result.append(item)
        else:
            result.append(item.model_dump())
    return result


def upsert_closure(db: Session, body: HotoCreate, user_id: str) -> CashClosureRecord:
    """
    Insert a new record or update an existing draft for the same date.
    Submitted/verified records cannot be overwritten — return as-is.
    """
    existing = get_closure_by_date(db, body.closure_date)
    if existing and existing.status == "verified":
        return existing

    totals = compute_totals(body)

    data = dict(
        closure_date=body.closure_date,
        submitted_by=user_id,
        submitted_at=datetime.now(timezone.utc),
        status="submitted",
        opening_cash=body.opening_cash,
        net_sales=body.net_sales,
        sodexo_collection=body.sodexo_collection,
        manual_billings=_items_to_dict(body.manual_billings),
        old_balance_collections=_items_to_dict(body.old_balance_collections),
        distributor_expiry=body.distributor_expiry,
        oil_crush=body.oil_crush,
        other_income=body.other_income,
        pluxee_amount=body.pluxee_amount,
        paytm_amount=body.paytm_amount,
        phonepe_amount=body.phonepe_amount,
        card_amount=body.card_amount,
        credits_given=_items_to_dict(body.credits_given),
        returns_amount=body.returns_amount,
        expenses=_items_to_dict(body.expenses),
        physical_cash_counted=body.physical_cash_counted,
        denominations_opening=body.denominations_opening,
        denominations_sales=body.denominations_sales,
        notes=body.notes,
        **totals,
    )

    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        record = existing
    else:
        record = CashClosureRecord(**data)
        db.add(record)

    db.flush()
    return record


def save_draft(db: Session, body: HotoCreate, user_id: str) -> CashClosureRecord:
    """Save without changing status to submitted (for Save Draft button)."""
    existing = get_closure_by_date(db, body.closure_date)
    if existing and existing.status == "verified":
        return existing

    totals = compute_totals(body)

    data = dict(
        closure_date=body.closure_date,
        submitted_by=user_id,
        opening_cash=body.opening_cash,
        net_sales=body.net_sales,
        sodexo_collection=body.sodexo_collection,
        manual_billings=_items_to_dict(body.manual_billings),
        old_balance_collections=_items_to_dict(body.old_balance_collections),
        distributor_expiry=body.distributor_expiry,
        oil_crush=body.oil_crush,
        other_income=body.other_income,
        pluxee_amount=body.pluxee_amount,
        paytm_amount=body.paytm_amount,
        phonepe_amount=body.phonepe_amount,
        card_amount=body.card_amount,
        credits_given=_items_to_dict(body.credits_given),
        returns_amount=body.returns_amount,
        expenses=_items_to_dict(body.expenses),
        physical_cash_counted=body.physical_cash_counted,
        denominations_opening=body.denominations_opening,
        denominations_sales=body.denominations_sales,
        notes=body.notes,
        **totals,
    )

    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        record = existing
    else:
        record = CashClosureRecord(**data)
        db.add(record)

    db.flush()
    return record


def list_closures(db: Session, limit: int = 30, offset: int = 0) -> tuple[int, list[CashClosureRecord]]:
    q = db.query(CashClosureRecord).order_by(CashClosureRecord.closure_date.desc())
    total = q.count()
    items = q.limit(limit).offset(offset).all()
    return total, items


def get_closure(db: Session, closure_id: str) -> CashClosureRecord | None:
    return db.query(CashClosureRecord).filter(CashClosureRecord.id == closure_id).first()


def get_closure_by_date(db: Session, closure_date: date) -> CashClosureRecord | None:
    return db.query(CashClosureRecord).filter(CashClosureRecord.closure_date == closure_date).first()


def verify_closure(
    db: Session,
    closure_id: str,
    verifier_id: str,
    new_status: str,
    notes: str | None,
) -> CashClosureRecord | None:
    record = get_closure(db, closure_id)
    if record:
        record.status = new_status
        record.verified_by = verifier_id
        record.verified_at = datetime.now(timezone.utc)
        if notes:
            record.notes = (record.notes or "") + f"\n[Verification] {notes}"
    return record
