from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.dependencies import get_conn, get_current_user
from api.schemas.auth import CurrentUser

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[dict])
def list_suppliers(
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    rows = conn.execute(
        text("""
            SELECT DISTINCT
                m.supplier_name,
                l.supplier_region,
                CASE WHEN l.supplier_region = 'BELLARY' THEN 7 ELSE 15 END AS lead_time_days,
                COUNT(m.product_id) AS product_count
            FROM derived.product_supplier_mapping m
            LEFT JOIN derived.supplier_location l ON m.supplier_name = l.supplier_name
            GROUP BY m.supplier_name, l.supplier_region
            ORDER BY m.supplier_name
        """)
    ).mappings().all()

    return [dict(r) for r in rows]


@router.get("/{supplier_name}/restock", response_model=dict)
def get_supplier_restock(
    supplier_name: str,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    params = {"supplier_name": supplier_name, "limit": limit, "offset": offset}

    base_sql = """
        FROM derived.supplier_restock_recommendations
        WHERE date = (SELECT MAX(date) FROM derived.supplier_restock_recommendations)
          AND supplier_name = :supplier_name
    """

    total = conn.execute(text(f"SELECT COUNT(*) {base_sql}"), params).scalar()
    rows = conn.execute(
        text(f"""
            SELECT
                product_id      AS barcode,
                product_name,
                supplier_name,
                current_stock,
                predicted_daily_demand,
                days_of_cover,
                min_stock,
                max_stock,
                required_quantity,
                lead_time_days
            {base_sql}
            ORDER BY days_of_cover ASC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).mappings().all()

    return {
        "supplier_name": supplier_name,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [dict(r) for r in rows],
    }
