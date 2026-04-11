from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.dependencies import get_conn, get_current_user
from api.schemas.auth import CurrentUser
from api.schemas.customers import CustomerBill, CustomerListItem, CustomerSummary

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("", response_model=dict)
def list_customers(
    search: str = Query(default=None, max_length=100),
    is_repeat: bool = Query(default=None),
    is_member: bool = Query(default=None),
    include_walkin: bool = Query(default=False),
    sort_by: str = Query(default="total_revenue", pattern="^(total_revenue|total_bills|last_seen_date|avg_bill_value)$"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """Paginated customer list, sorted by revenue by default. Walk-ins excluded unless requested."""
    filters = []
    params: dict = {}

    if not include_walkin:
        filters.append("d.is_walk_in = FALSE")

    if search:
        filters.append("(d.display_name ILIKE :search OR d.mobile_clean ILIKE :search)")
        params["search"] = f"%{search}%"

    if is_repeat is not None:
        filters.append("m.is_repeat = :is_repeat")
        params["is_repeat"] = is_repeat

    if is_member is not None:
        filters.append("d.is_member = :is_member")
        params["is_member"] = is_member

    where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""

    sort_map = {
        "total_revenue": "m.total_revenue DESC NULLS LAST",
        "total_bills": "m.total_bills DESC NULLS LAST",
        "last_seen_date": "d.last_seen_date DESC NULLS LAST",
        "avg_bill_value": "m.avg_bill_value DESC NULLS LAST",
    }
    order_clause = sort_map[sort_by]

    base_sql = f"""
        FROM derived.customer_dimension d
        LEFT JOIN derived.customer_metrics m ON d.mobile_clean = m.mobile_clean
        {where_clause}
    """

    total = conn.execute(text(f"SELECT COUNT(*) {base_sql}"), params).scalar()

    rows = conn.execute(
        text(f"""
            SELECT
                d.mobile_clean,
                d.display_name,
                d.is_walk_in,
                d.is_member,
                d.first_seen_date,
                d.last_seen_date,
                d.total_bills,
                m.total_revenue,
                m.avg_bill_value,
                m.total_discount_received,
                m.days_since_last_visit,
                m.avg_days_between_visits,
                m.is_repeat,
                m.preferred_payment
            {base_sql}
            ORDER BY {order_clause}
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": limit, "offset": offset},
    ).mappings().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [CustomerListItem(**dict(r)) for r in rows],
    }


@router.get("/summary", response_model=CustomerSummary)
def get_customer_summary(
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """Aggregate KPIs across all identified (non-walk-in) customers."""
    row = conn.execute(text("""
        WITH identified AS (
            SELECT d.mobile_clean, d.is_member, d.first_seen_date, m.avg_bill_value, m.is_repeat
            FROM derived.customer_dimension d
            LEFT JOIN derived.customer_metrics m ON d.mobile_clean = m.mobile_clean
            WHERE d.is_walk_in = FALSE
        ),
        total_rev AS (
            SELECT SUM(total_revenue) AS total
            FROM derived.customer_metrics
        ),
        walkin_rev AS (
            SELECT COALESCE(total_revenue, 0) AS total
            FROM derived.customer_metrics
            WHERE mobile_clean = 'WALK-IN'
        )
        SELECT
            COUNT(*)                                                          AS total_unique_customers,
            COUNT(*) FILTER (WHERE is_repeat = TRUE)                         AS repeat_customer_count,
            ROUND(
                COUNT(*) FILTER (WHERE is_repeat = TRUE) * 100.0
                / NULLIF(COUNT(*), 0), 1
            )                                                                 AS repeat_customer_percent,
            AVG(avg_bill_value)                                               AS avg_bill_value,
            COUNT(*) FILTER (WHERE is_member = TRUE)                         AS members_count,
            COUNT(*) FILTER (WHERE first_seen_date >= CURRENT_DATE - 30)     AS new_customers_last_30d,
            ROUND(
                (SELECT total FROM walkin_rev) * 100.0
                / NULLIF((SELECT total FROM total_rev), 0), 1
            )                                                                 AS walk_in_revenue_percent
        FROM identified
    """)).mappings().one()

    return CustomerSummary(
        total_unique_customers=int(row["total_unique_customers"] or 0),
        repeat_customer_count=int(row["repeat_customer_count"] or 0),
        repeat_customer_percent=float(row["repeat_customer_percent"] or 0),
        avg_bill_value=float(row["avg_bill_value"]) if row["avg_bill_value"] else None,
        members_count=int(row["members_count"] or 0),
        new_customers_last_30d=int(row["new_customers_last_30d"] or 0),
        walk_in_revenue_percent=float(row["walk_in_revenue_percent"]) if row["walk_in_revenue_percent"] else None,
    )


@router.get("/{mobile}/history", response_model=list[CustomerBill])
def get_customer_history(
    mobile: str,
    limit: int = Query(default=50, le=200),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """All bills for a customer identified by their normalized 10-digit mobile."""
    rows = conn.execute(
        text("""
            SELECT
                bill_no,
                TO_TIMESTAMP(bill_datetime_raw, 'DD-MM-YYYYHH12:MI AM')::DATE AS bill_date,
                net_total,
                total_discount,
                COALESCE(actual_cash, cash_amount, 0)                                    AS cash_total,
                COALESCE(card_amount, 0)                                                 AS card_total,
                COALESCE(google_pay_amount,0)+COALESCE(phonepe_amount,0)
                    +COALESCE(paytm_amount,0)                                            AS upi_total,
                COALESCE(credit_amount, 0)                                               AS credit_total
            FROM raw.raw_sales_billwise
            WHERE REGEXP_REPLACE(COALESCE(customer_mobile_raw,''), '[^0-9]','','g')
                      ~ ('^(91|0)?'||:mobile||'$')
               OR REGEXP_REPLACE(COALESCE(customer_mobile_raw,''), '[^0-9]','','g') = :mobile
            ORDER BY bill_datetime_raw DESC
            LIMIT :limit
        """),
        {"mobile": mobile, "limit": limit},
    ).mappings().all()

    return [CustomerBill(**dict(r)) for r in rows]
