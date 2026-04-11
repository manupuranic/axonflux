from datetime import date, datetime, timezone

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.tools.cash_closure.models import CashClosureRecord
from api.tools.cash_closure.schemas import CashClosureCreate, SystemTotals

# SQL to pull system-side payment totals for a given date from raw billing data.
# Uses the same TO_TIMESTAMP format string as derived_tables.sql.
_SYSTEM_TOTALS_SQL = text("""
    SELECT
        COUNT(*)                                                    AS total_bills,
        COALESCE(SUM(cash_amount::numeric),       0)               AS system_cash,
        COALESCE(SUM(card_amount::numeric),       0)               AS system_card,
        COALESCE(SUM(google_pay_amount::numeric), 0)               AS system_googlepay,
        COALESCE(SUM(phonepe_amount::numeric),    0)               AS system_phonepe,
        COALESCE(SUM(paytm_amount::numeric),      0)               AS system_paytm,
        COALESCE(SUM(net_total::numeric),         0)               AS system_net_total
    FROM raw.raw_sales_billwise
    WHERE TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE = :closure_date
""")


def get_system_totals(conn: Connection, closure_date: date) -> SystemTotals:
    row = conn.execute(_SYSTEM_TOTALS_SQL, {"closure_date": closure_date}).mappings().one()
    return SystemTotals(
        closure_date=closure_date,
        total_bills=int(row["total_bills"]),
        system_cash=float(row["system_cash"]),
        system_card=float(row["system_card"]),
        system_googlepay=float(row["system_googlepay"]),
        system_phonepe=float(row["system_phonepe"]),
        system_paytm=float(row["system_paytm"]),
        system_net_total=float(row["system_net_total"]),
    )


def create_closure(
    db: Session,
    conn: Connection,
    body: CashClosureCreate,
    user_id: str,
) -> CashClosureRecord:
    totals = get_system_totals(conn, body.closure_date)

    staff_upi = sum(filter(None, [body.upi_googlepay, body.upi_phonepe, body.upi_paytm]))
    system_upi = totals.system_googlepay + totals.system_phonepe + totals.system_paytm

    record = CashClosureRecord(
        closure_date=body.closure_date,
        submitted_by=user_id,
        submitted_at=datetime.now(timezone.utc),
        status="submitted",
        physical_cash=body.physical_cash,
        card_total=body.card_total,
        upi_googlepay=body.upi_googlepay,
        upi_phonepe=body.upi_phonepe,
        upi_paytm=body.upi_paytm,
        system_cash=totals.system_cash,
        system_card=totals.system_card,
        system_googlepay=totals.system_googlepay,
        system_phonepe=totals.system_phonepe,
        system_paytm=totals.system_paytm,
        system_net_total=totals.system_net_total,
        notes=body.notes,
    )
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


def verify_closure(db: Session, closure_id: str, verifier_id: str, new_status: str, notes: str | None) -> CashClosureRecord | None:
    record = get_closure(db, closure_id)
    if record:
        record.status = new_status
        record.verified_by = verifier_id
        record.verified_at = datetime.now(timezone.utc)
        if notes:
            record.notes = (record.notes or "") + f"\n[Verification] {notes}"
    return record
