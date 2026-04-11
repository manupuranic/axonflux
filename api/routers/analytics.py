from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.dependencies import get_conn, get_current_user
from api.schemas.analytics import (
    AnalyticsSummary,
    DailyRevenue,
    DailyPayment,
    DailyPurchase,
    DemandTrendPoint,
    ProductHealthSignal,
    ReplenishmentItem,
    TopProduct,
)
from api.schemas.auth import CurrentUser

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
def get_summary(
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """KPI cards for the dashboard home."""
    row = conn.execute(text("""
        WITH latest AS (
            SELECT MAX(date) AS d FROM derived.product_health_signals
        ),
        revenue_7d AS (
            SELECT
                SUM(total_revenue)  AS rev,
                SUM(total_bills)    AS bills
            FROM derived.daily_sales_summary
            WHERE sale_date >= (SELECT d FROM latest) - INTERVAL '6 days'
        ),
        purchase_7d AS (
            SELECT
                SUM(total_taxable_value)     AS purch,
                SUM(total_purchase_bills)    AS p_bills,
                SUM(COALESCE(total_due_amount, 0)) AS credit
            FROM derived.daily_purchase_summary
            WHERE purchase_date >= (SELECT d FROM latest)::DATE - INTERVAL '6 days'
        ),
        signals AS (
            SELECT
                COUNT(*) FILTER (WHERE fast_moving_flag)   AS fast,
                COUNT(*) FILTER (WHERE slow_moving_flag)   AS slow,
                COUNT(*) FILTER (WHERE dead_stock_flag)    AS dead,
                COUNT(*) FILTER (WHERE demand_spike_flag)  AS spike
            FROM derived.product_health_signals
            WHERE date = (SELECT d FROM latest)
        ),
        reorder AS (
            SELECT COUNT(*) AS needs_reorder
            FROM derived.supplier_restock_recommendations
            WHERE date = (SELECT d FROM latest)
              AND required_quantity > 0
        ),
        customer_kpis AS (
            SELECT
                COUNT(*) FILTER (WHERE NOT is_walk_in)                                             AS total_unique,
                COUNT(*) FILTER (WHERE is_repeat AND NOT is_walk_in)                               AS repeat_count,
                COUNT(*) FILTER (WHERE first_seen_date >= CURRENT_DATE - INTERVAL '30 days'
                                   AND NOT is_walk_in)                                             AS new_last_30d
            FROM derived.customer_dimension
        ),
        walk_in_rev AS (
            SELECT
                ROUND(
                    100.0 * SUM(total_revenue) FILTER (WHERE mobile_clean = 'WALK-IN')
                    / NULLIF(SUM(total_revenue), 0),
                    1
                ) AS walk_in_pct
            FROM derived.customer_metrics
        )
        SELECT
            (SELECT d FROM latest)                  AS latest_date,
            (SELECT rev   FROM revenue_7d)          AS total_revenue_last_7d,
            (SELECT bills FROM revenue_7d)          AS total_bills_last_7d,
            (SELECT purch FROM purchase_7d)         AS total_purchases_last_7d,
            (SELECT p_bills FROM purchase_7d)       AS total_purchase_bills_last_7d,
            (SELECT credit FROM purchase_7d)        AS total_credit_last_7d,
            (SELECT fast  FROM signals)             AS fast_moving_count,
            (SELECT slow  FROM signals)             AS slow_moving_count,
            (SELECT dead  FROM signals)             AS dead_stock_count,
            (SELECT spike FROM signals)             AS demand_spike_count,
            (SELECT needs_reorder FROM reorder)     AS products_needing_reorder,
            (SELECT total_unique FROM customer_kpis)  AS total_unique_customers,
            (SELECT repeat_count FROM customer_kpis)  AS repeat_customer_count,
            (SELECT new_last_30d FROM customer_kpis)  AS new_customers_last_30d,
            (SELECT walk_in_pct FROM walk_in_rev)     AS walk_in_revenue_percent
    """)).mappings().one()

    total_unique = int(row["total_unique_customers"] or 0)
    repeat_count = int(row["repeat_customer_count"] or 0)

    return AnalyticsSummary(
        latest_date=row["latest_date"],
        total_revenue_last_7d=float(row["total_revenue_last_7d"]) if row["total_revenue_last_7d"] else None,
        total_bills_last_7d=int(row["total_bills_last_7d"]) if row["total_bills_last_7d"] else None,
        total_purchases_last_7d=float(row["total_purchases_last_7d"]) if row["total_purchases_last_7d"] else None,
        total_purchase_bills_last_7d=int(row["total_purchase_bills_last_7d"]) if row["total_purchase_bills_last_7d"] else None,
        total_credit_last_7d=float(row["total_credit_last_7d"]) if row["total_credit_last_7d"] else None,
        fast_moving_count=int(row["fast_moving_count"] or 0),
        slow_moving_count=int(row["slow_moving_count"] or 0),
        dead_stock_count=int(row["dead_stock_count"] or 0),
        demand_spike_count=int(row["demand_spike_count"] or 0),
        products_needing_reorder=int(row["products_needing_reorder"] or 0),
        total_unique_customers=total_unique,
        repeat_customer_percent=round(repeat_count / total_unique * 100, 1) if total_unique else None,
        new_customers_last_30d=int(row["new_customers_last_30d"] or 0),
        walk_in_revenue_percent=float(row["walk_in_revenue_percent"]) if row["walk_in_revenue_percent"] else None,
    )


@router.get("/daily-revenue", response_model=list[DailyRevenue])
def get_daily_revenue(
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=89)

    rows = conn.execute(
        text("""
            SELECT sale_date, total_bills, total_items_sold, total_revenue, avg_bill_value
            FROM derived.daily_sales_summary
            WHERE sale_date BETWEEN :from_date AND :to_date
            ORDER BY sale_date
        """),
        {"from_date": from_date, "to_date": to_date},
    ).mappings().all()

    return [DailyRevenue(**dict(r)) for r in rows]


@router.get("/daily-payments", response_model=list[DailyPayment])
def get_daily_payments(
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=89)

    rows = conn.execute(
        text("""
            SELECT
                sale_date, total_bills, cash_total, card_total,
                google_pay_total, phonepe_total, paytm_total, upi_total,
                credit_total, cn_redeemed_total, total_discount, membercard_discount_total
            FROM derived.daily_payment_breakdown
            WHERE sale_date BETWEEN :from_date AND :to_date
            ORDER BY sale_date
        """),
        {"from_date": from_date, "to_date": to_date},
    ).mappings().all()

    return [DailyPayment(**dict(r)) for r in rows]


@router.get("/daily-purchases", response_model=list[DailyPurchase])
def get_daily_purchases(
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=89)

    rows = conn.execute(
        text("""
            SELECT
                purchase_date, total_purchase_bills, total_quantity_purchased,
                total_taxable_value, total_settled_amount, total_due_amount
            FROM derived.daily_purchase_summary
            WHERE purchase_date BETWEEN :from_date AND :to_date
            ORDER BY purchase_date
        """),
        {"from_date": from_date, "to_date": to_date},
    ).mappings().all()

    return [DailyPurchase(**dict(r)) for r in rows]


@router.get("/health-signals", response_model=dict)
def get_health_signals(
    flag: str = Query(default="all", pattern="^(all|fast|slow|dead|spike)$"),
    search: str = Query(default=None, max_length=100),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    flag_filter = {
        "fast":  "h.fast_moving_flag = TRUE",
        "slow":  "h.slow_moving_flag = TRUE",
        "dead":  "h.dead_stock_flag = TRUE",
        "spike": "h.demand_spike_flag = TRUE",
    }.get(flag, "TRUE")

    search_filter = ""
    params: dict = {"flag_filter": flag_filter}
    if search:
        search_filter = "AND (h.product_id ILIKE :search OR d.product_name ILIKE :search)"
        params["search"] = f"%{search}%"

    base_sql = f"""
        FROM derived.product_health_signals h
        LEFT JOIN derived.product_dimension d ON h.product_id = d.product_id
        WHERE h.date = (SELECT MAX(date) FROM derived.product_health_signals)
          AND {flag_filter}
          {search_filter}
    """

    total = conn.execute(text(f"SELECT COUNT(*) {base_sql}"), params).scalar()

    rows = conn.execute(
        text(f"""
            SELECT
                h.product_id,
                d.product_name,
                h.fast_moving_flag,
                h.slow_moving_flag,
                h.dead_stock_flag,
                h.demand_spike_flag,
                h.predicted_daily_demand,
                h.last_7_day_avg,
                h.last_30_day_avg,
                h.last_60_day_avg,
                h.demand_volatility
            {base_sql}
            ORDER BY h.predicted_daily_demand DESC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": limit, "offset": offset},
    ).mappings().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [ProductHealthSignal(**dict(r)) for r in rows],
    }


@router.get("/replenishment", response_model=dict)
def get_replenishment(
    supplier: str = Query(default=None, description="Filter by supplier name (partial match)"),
    urgent_only: bool = Query(default=False, description="Only products with days_of_cover < lead_time_days"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    supplier_filter = "AND r.supplier_name ILIKE :supplier" if supplier else ""
    urgent_filter = "AND r.days_of_cover < r.lead_time_days" if urgent_only else ""
    params: dict = {}
    if supplier:
        params["supplier"] = f"%{supplier}%"

    base_sql = f"""
        FROM derived.supplier_restock_recommendations r
        WHERE r.date = (SELECT MAX(date) FROM derived.supplier_restock_recommendations)
          {supplier_filter}
          {urgent_filter}
    """

    total = conn.execute(text(f"SELECT COUNT(*) {base_sql}"), params).scalar()

    rows = conn.execute(
        text(f"""
            SELECT
                r.product_id    AS barcode,
                r.product_name,
                r.supplier_name,
                r.current_stock AS system_stock,
                r.predicted_daily_demand,
                r.days_of_cover,
                r.min_stock,
                r.max_stock,
                r.required_quantity,
                r.lead_time_days
            {base_sql}
            ORDER BY r.days_of_cover ASC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": limit, "offset": offset},
    ).mappings().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [ReplenishmentItem(**dict(r)) for r in rows],
    }


@router.get("/top-products", response_model=list[TopProduct])
def get_top_products(
    days: int = Query(default=30, ge=7, le=365),
    limit: int = Query(default=10, ge=1, le=50),
    sort_by: str = Query(default="revenue", pattern="^(revenue|qty)$"),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """Top N products by revenue or quantity sold over the last N days."""
    order_col = "total_revenue" if sort_by == "revenue" else "total_qty"

    rows = conn.execute(
        text(f"""
            SELECT
                ROW_NUMBER() OVER (ORDER BY SUM(f.revenue) DESC NULLS LAST) AS rank,
                f.product_id                                                  AS barcode,
                d.product_name,
                COALESCE(SUM(f.revenue), 0)                                  AS total_revenue,
                COALESCE(SUM(f.quantity_sold), 0)                            AS total_qty
            FROM derived.product_daily_features f
            LEFT JOIN derived.product_dimension d ON f.product_id = d.product_id
            WHERE f.date >= CURRENT_DATE - (:days || ' days')::INTERVAL
              AND f.quantity_sold > 0
            GROUP BY f.product_id, d.product_name
            ORDER BY {order_col} DESC NULLS LAST
            LIMIT :limit
        """),
        {"days": days, "limit": limit},
    ).mappings().all()

    return [TopProduct(**dict(r)) for r in rows]


@router.get("/demand-trend/{barcode}", response_model=list[DemandTrendPoint])
def get_demand_trend(
    barcode: str,
    days: int = Query(default=60, ge=7, le=365),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    rows = conn.execute(
        text("""
            SELECT
                f.date,
                f.quantity_sold,
                f.revenue,
                f.last_7_day_avg,
                f.last_30_day_avg,
                h.predicted_daily_demand
            FROM derived.product_daily_features f
            LEFT JOIN derived.product_health_signals h
                   ON f.product_id = h.product_id AND f.date = h.date
            WHERE f.product_id = :barcode
              AND f.date >= CURRENT_DATE - (:days || ' days')::INTERVAL
            ORDER BY f.date
        """),
        {"barcode": barcode, "days": days},
    ).mappings().all()

    return [DemandTrendPoint(**dict(r)) for r in rows]
