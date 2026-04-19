from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.dependencies import get_conn, get_db, get_current_user, require_admin
from api.models.app import AppProduct
from api.schemas.auth import CurrentUser
from api.schemas.products import (
    ProductResponse,
    ProductSearchResult,
    ProductUpdate,
    BulkCategorizeRequest,
    BulkCategorizeResponse,
)

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("/search", response_model=list[ProductSearchResult])
def search_products(
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=20, le=100),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Fast search across canonical names and barcodes.
    Falls back to derived.product_dimension when app.products has no entry.
    Used by the pamphlet builder and replenishment UI.
    """
    rows = conn.execute(
        text("""
            SELECT
                d.product_id                                                    AS barcode,
                COALESCE(p.canonical_name, d.product_name)                     AS canonical_name,
                p.category,
                ic.mrp
            FROM derived.product_dimension d
            LEFT JOIN app.products          p  ON d.product_id = p.barcode
            LEFT JOIN derived.latest_item_combinations ic ON d.product_id = ic.product_id
            WHERE
                COALESCE(p.canonical_name, d.product_name) ILIKE :q
                OR d.product_id ILIKE :q
            ORDER BY COALESCE(p.canonical_name, d.product_name)
            LIMIT :limit
        """),
        {"q": f"%{q}%", "limit": limit},
    ).mappings().all()

    return [ProductSearchResult(**dict(r)) for r in rows]


@router.get("", response_model=dict)
def list_products(
    search: str = Query(default=None, max_length=100),
    category: str = Query(default=None),
    is_reviewed: bool | None = Query(default=None),
    active_only: bool = Query(default=True),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    filters = ["TRUE"]
    params: dict = {"limit": limit, "offset": offset}

    if search:
        filters.append("(COALESCE(p.canonical_name, d.product_name) ILIKE :search OR d.product_id ILIKE :search)")
        params["search"] = f"%{search}%"
    if category:
        filters.append("p.category = :category")
        params["category"] = category
    if is_reviewed is not None:
        filters.append("p.is_reviewed = :is_reviewed")
        params["is_reviewed"] = is_reviewed
    if active_only:
        filters.append("(p.is_active IS NULL OR p.is_active = TRUE)")

    where = " AND ".join(filters)
    base_sql = f"""
        FROM derived.product_dimension d
        LEFT JOIN app.products p ON d.product_id = p.barcode
        WHERE {where}
    """

    total = conn.execute(text(f"SELECT COUNT(*) {base_sql}"), params).scalar()
    rows = conn.execute(
        text(f"""
            SELECT
                d.product_id                                    AS barcode,
                COALESCE(p.canonical_name, d.product_name)     AS canonical_name,
                p.category,
                p.subcategory,
                p.brand,
                p.product_type,
                p.size,
                p.colour,
                p.unit_of_measure,
                p.gst_rate_percent,
                p.is_active,
                p.is_reviewed,
                p.created_at,
                p.updated_at
            {base_sql}
            ORDER BY COALESCE(p.canonical_name, d.product_name)
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).mappings().all()

    return {"total": total, "limit": limit, "offset": offset, "items": list(rows)}


@router.post("/bulk-categorize", response_model=BulkCategorizeResponse)
def bulk_categorize(
    body: BulkCategorizeRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Batch update category and/or product_type for multiple products.
    Auto-sets is_reviewed=True and updated_at=now() on all matched rows.
    """
    now = datetime.now(timezone.utc)
    updated = 0
    skipped = 0

    for barcode in body.barcodes:
        product = db.query(AppProduct).filter(AppProduct.barcode == barcode).first()
        if not product:
            skipped += 1
            continue

        if body.category is not None:
            product.category = body.category
        if body.product_type is not None:
            product.product_type = body.product_type

        product.is_reviewed = True
        product.updated_at = now
        updated += 1

    db.commit()
    return BulkCategorizeResponse(updated=updated, skipped=skipped)


@router.get("/{barcode}/recommendations", response_model=list[dict])
def get_recommendations(
    barcode: str,
    limit: int = Query(default=5, le=20),
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Returns products frequently bought together with the given barcode.
    Sorted by co_occurrences desc, then lift desc.
    """
    rows = conn.execute(
        text("""
            SELECT
                other_barcode,
                COALESCE(p.canonical_name, d.product_name) AS canonical_name,
                p.category,
                ic.mrp,
                pa.co_occurrences,
                pa.lift,
                CASE
                    WHEN pa.barcode_a = :barcode THEN pa.confidence_a_to_b
                    ELSE pa.confidence_b_to_a
                END AS confidence
            FROM (
                SELECT
                    CASE WHEN barcode_a = :barcode THEN barcode_b ELSE barcode_a END AS other_barcode,
                    co_occurrences, lift, confidence_a_to_b, confidence_b_to_a,
                    barcode_a
                FROM derived.product_associations
                WHERE barcode_a = :barcode OR barcode_b = :barcode
            ) pa
            JOIN derived.product_dimension d ON d.product_id = pa.other_barcode
            LEFT JOIN app.products         p ON p.barcode = pa.other_barcode
            LEFT JOIN derived.latest_item_combinations ic ON ic.product_id = pa.other_barcode
            ORDER BY pa.co_occurrences DESC, pa.lift DESC
            LIMIT :limit
        """),
        {"barcode": barcode, "limit": limit},
    ).mappings().all()

    return [dict(r) for r in rows]


@router.get("/{barcode}", response_model=dict)
def get_product(
    barcode: str,
    conn: Connection = Depends(get_conn),
    _: CurrentUser = Depends(get_current_user),
):
    row = conn.execute(
        text("""
            SELECT
                d.product_id                                        AS barcode,
                COALESCE(p.canonical_name, d.product_name)         AS canonical_name,
                p.category, p.subcategory, p.brand, p.product_type,
                p.unit_of_measure, p.pack_size, p.image_url, p.size, p.colour,
                p.hsn_code, p.gst_rate_percent,
                p.is_active, p.is_reviewed,
                p.created_at, p.updated_at,
                ic.mrp, ic.purchase_price, ic.current_stock AS system_stock
            FROM derived.product_dimension d
            LEFT JOIN app.products p ON d.product_id = p.barcode
            LEFT JOIN derived.latest_item_combinations ic ON d.product_id = ic.product_id
            WHERE d.product_id = :barcode
        """),
        {"barcode": barcode},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return dict(row)


@router.patch("/{barcode}", response_model=ProductResponse)
def update_product(
    barcode: str,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    product = db.query(AppProduct).filter(AppProduct.barcode == barcode).first()

    if not product:
        # First time editing this product — create the canonical record
        product = AppProduct(
            barcode=barcode,
            canonical_name=body.canonical_name or barcode,
            created_at=datetime.now(timezone.utc),
        )
        db.add(product)

    # Auto-mark reviewed if staff modifies meaningful fields and doesn't explicitly set is_reviewed
    meaningful_fields = {"canonical_name", "category", "subcategory", "product_type"}
    modified_fields = set(body.model_dump(exclude_none=True).keys())
    if meaningful_fields & modified_fields and body.is_reviewed is None:
        body.is_reviewed = True

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    product.updated_at = datetime.now(timezone.utc)

    db.flush()
    return product
