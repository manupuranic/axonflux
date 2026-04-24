"""
Service layer for entity resolution tool.
All DB operations use raw SQL via SQLAlchemy connections/sessions
to stay consistent with the rest of the codebase.
"""
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.schemas.auth import CurrentUser
from api.tools.entity_resolution.schemas import (
    AliasResponse,
    ConfirmRequest,
    SuggestionCluster,
    SuggestionItem,
)


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

def get_suggestions(
    conn: Connection,
    suggestion_status: str = "pending",
    min_score: float | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[SuggestionCluster]:
    where_clauses = ["status = :status"]
    params: dict = {"status": suggestion_status}
    if min_score is not None:
        where_clauses.append("similarity_score >= :min_score")
        params["min_score"] = min_score

    where_sql = " AND ".join(where_clauses)
    rows = conn.execute(text(f"""
        SELECT id, cluster_key, alias_barcode, canonical_candidate,
               alias_name, canonical_name, similarity_score, status
        FROM app.product_merge_suggestions
        WHERE {where_sql}
        ORDER BY similarity_score DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).fetchall()

    clusters_map: dict[str, list[SuggestionItem]] = defaultdict(list)
    for r in rows:
        clusters_map[r.cluster_key].append(SuggestionItem(
            id=str(r.id),
            alias_barcode=r.alias_barcode,
            canonical_candidate=r.canonical_candidate,
            alias_name=r.alias_name,
            canonical_name=r.canonical_name,
            similarity_score=float(r.similarity_score),
            status=r.status,
        ))

    result = []
    for cluster_key, members in clusters_map.items():
        scores = [m.similarity_score for m in members]
        result.append(SuggestionCluster(
            cluster_key=cluster_key,
            canonical_candidate=members[0].canonical_candidate,
            canonical_name=members[0].canonical_name,
            members=members,
            min_score=min(scores),
            max_score=max(scores),
        ))
    # Sort clusters by max score descending
    result.sort(key=lambda c: c.max_score, reverse=True)
    return result


# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------

def confirm_alias(
    db: Session,
    body: ConfirmRequest,
    current_user: CurrentUser,
) -> AliasResponse:
    # Circular alias guard
    existing_alias = db.execute(text("""
        SELECT canonical_barcode FROM app.product_aliases
        WHERE alias_barcode = :canonical_barcode
    """), {"canonical_barcode": body.canonical_barcode}).fetchone()
    if existing_alias:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Barcode {body.canonical_barcode!r} is itself an alias — cannot use as canonical",
        )

    reverse_alias = db.execute(text("""
        SELECT canonical_barcode FROM app.product_aliases
        WHERE canonical_barcode = :alias_barcode
    """), {"alias_barcode": body.alias_barcode}).fetchone()
    if reverse_alias:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Barcode {body.alias_barcode!r} is already a canonical for another alias",
        )

    # Get suggestion row for similarity_score
    suggestion = db.execute(text("""
        SELECT similarity_score, alias_name, canonical_name
        FROM app.product_merge_suggestions
        WHERE alias_barcode = :alias AND canonical_candidate = :canonical
        LIMIT 1
    """), {"alias": body.alias_barcode, "canonical": body.canonical_barcode}).fetchone()

    similarity_score = float(suggestion.similarity_score) if suggestion else None

    # Ensure canonical barcode has an app.products row (FK requirement)
    canonical_name = (suggestion.canonical_name if suggestion else None) or body.canonical_barcode
    db.execute(text("""
        INSERT INTO app.products (barcode, canonical_name, created_at, updated_at)
        VALUES (:barcode, :canonical_name, NOW(), NOW())
        ON CONFLICT (barcode) DO NOTHING
    """), {"barcode": body.canonical_barcode, "canonical_name": canonical_name})

    now = datetime.now(timezone.utc)

    # Insert alias
    db.execute(text("""
        INSERT INTO app.product_aliases
            (alias_barcode, canonical_barcode, similarity_score, confirmed_by, confirmed_at, notes)
        VALUES
            (:alias_barcode, :canonical_barcode, :similarity_score, :confirmed_by, :confirmed_at, :notes)
        ON CONFLICT (alias_barcode) DO UPDATE SET
            canonical_barcode = EXCLUDED.canonical_barcode,
            similarity_score  = EXCLUDED.similarity_score,
            confirmed_by      = EXCLUDED.confirmed_by,
            confirmed_at      = EXCLUDED.confirmed_at,
            notes             = EXCLUDED.notes
    """), {
        "alias_barcode": body.alias_barcode,
        "canonical_barcode": body.canonical_barcode,
        "similarity_score": similarity_score,
        "confirmed_by": current_user.id,
        "confirmed_at": now,
        "notes": body.notes,
    })

    # Mark suggestion confirmed
    db.execute(text("""
        UPDATE app.product_merge_suggestions
        SET status = 'confirmed', reviewed_by = :user_id, reviewed_at = :now
        WHERE alias_barcode = :alias AND canonical_candidate = :canonical
    """), {
        "user_id": current_user.id,
        "now": now,
        "alias": body.alias_barcode,
        "canonical": body.canonical_barcode,
    })

    # Fetch confirmer username
    user_row = db.execute(text(
        "SELECT username FROM app.users WHERE id = :uid"
    ), {"uid": current_user.id}).fetchone()

    return AliasResponse(
        alias_barcode=body.alias_barcode,
        canonical_barcode=body.canonical_barcode,
        canonical_name=canonical_name,
        similarity_score=similarity_score,
        confirmed_at=now,
        confirmed_by_username=user_row.username if user_row else None,
        notes=body.notes,
    )


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

def reject_suggestion(db: Session, suggestion_id: str, current_user: CurrentUser) -> None:
    result = db.execute(text("""
        UPDATE app.product_merge_suggestions
        SET status = 'rejected', reviewed_by = :user_id, reviewed_at = NOW()
        WHERE id = :id
    """), {"user_id": current_user.id, "id": suggestion_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found")


# ---------------------------------------------------------------------------
# Aliases list
# ---------------------------------------------------------------------------

def list_aliases(
    conn: Connection,
    canonical_barcode: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    where = "WHERE 1=1"
    params: dict = {"limit": limit, "offset": offset}
    if canonical_barcode:
        where += " AND pa.canonical_barcode = :canonical_barcode"
        params["canonical_barcode"] = canonical_barcode

    rows = conn.execute(text(f"""
        SELECT
            pa.alias_barcode,
            pa.canonical_barcode,
            ap.canonical_name,
            pa.similarity_score,
            pa.confirmed_at,
            au.username AS confirmed_by_username,
            pa.notes
        FROM app.product_aliases pa
        LEFT JOIN app.products ap ON pa.canonical_barcode = ap.barcode
        LEFT JOIN app.users    au ON pa.confirmed_by = au.id
        {where}
        ORDER BY pa.confirmed_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    total_row = conn.execute(text(f"""
        SELECT COUNT(*) FROM app.product_aliases pa {where}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar()

    items = [AliasResponse(
        alias_barcode=r.alias_barcode,
        canonical_barcode=r.canonical_barcode,
        canonical_name=r.canonical_name,
        similarity_score=float(r.similarity_score) if r.similarity_score is not None else None,
        confirmed_at=r.confirmed_at,
        confirmed_by_username=r.confirmed_by_username,
        notes=r.notes,
    ) for r in rows]

    return {"total": total_row or 0, "items": items}


# ---------------------------------------------------------------------------
# Delete alias
# ---------------------------------------------------------------------------

def delete_alias(db: Session, alias_barcode: str) -> None:
    result = db.execute(text(
        "DELETE FROM app.product_aliases WHERE alias_barcode = :alias"
    ), {"alias": alias_barcode})
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")

    # Revert any confirmed suggestion back to pending so it reappears for review
    db.execute(text("""
        UPDATE app.product_merge_suggestions
        SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
        WHERE alias_barcode = :alias AND status = 'confirmed'
    """), {"alias": alias_barcode})
