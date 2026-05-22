"""
BOM auto-suggestion script (Phase B4).

Detects raw material → finished good pairs by:
  1. Raw candidates  = barcodes with 'LOOSE' in item_name_raw that appear in purchases
  2. Finished candidates = barcodes sold but never purchased, with a size token in name
  3. Normalize both names by stripping size/loose tokens → base name
  4. RapidFuzz match raw base names against finished base names
  5. Insert pending suggestions into app.product_bom_suggestions
     (skips pairs already confirmed or rejected)

Runs at the end of weekly_pipeline.py on every rebuild.

Usage:
    python scripts/suggest_bom.py [--min-score 70] [--dry-run]
"""

import argparse
import re
import sys
import uuid
from datetime import datetime, timezone

from rapidfuzz import fuzz
from sqlalchemy import text

sys.path.insert(0, ".")
from config.db import engine

# ---------------------------------------------------------------------------
# Token sets
# ---------------------------------------------------------------------------

_SIZE_TOKENS = re.compile(
    r"\b(\d+\s*(?:KG|KGS|G|GM|GMS|GR|L|LTR|LT|ML|MLS|MG|PCS|PC|NOS))\b"
    r"|\b(LOOSE|IN\s+KG[''S]*|PHM|PLAIN|BULK|SACHET|PACKET|PKT|PACK|BOX|TIN|JAR)\b",
    re.I,
)
_PUNCT       = re.compile(r"[^\w\s]")
_WHITESPACE  = re.compile(r"\s+")
_NOISE       = {"CO", "LTD", "PVT", "MFG", "INDIA", "THE", "AND", "OF"}


def base_name(raw: str) -> str:
    """Strip size/format tokens to get comparable base product name."""
    s = raw.upper()
    s = _SIZE_TOKENS.sub(" ", s)
    s = _PUNCT.sub(" ", s)
    tokens = [t for t in s.split() if t not in _NOISE and len(t) > 1]
    return _WHITESPACE.sub(" ", " ".join(tokens)).strip()


# ---------------------------------------------------------------------------
# Candidate queries
# ---------------------------------------------------------------------------

_RAW_CANDIDATES_SQL = """
    SELECT DISTINCT
        p.barcode,
        MAX(p.item_name_raw) AS item_name
    FROM raw.raw_purchase_itemwise p
    WHERE p.item_name_raw ILIKE '%LOOSE%'
       OR p.item_name_raw ILIKE '%IN KG%'
    GROUP BY p.barcode
"""

_FINISHED_CANDIDATES_SQL = """
    SELECT
        s.barcode,
        MAX(s.item_name_raw) AS item_name
    FROM raw.raw_sales_itemwise s
    WHERE NOT EXISTS (
        SELECT 1 FROM raw.raw_purchase_itemwise p
        WHERE p.barcode = s.barcode
    )
    AND (
        s.item_name_raw ~* '[0-9]+ *(KG|KGS|G|GM|GMS|GR|L|LTR|ML|MLS)'
        OR s.item_name_raw ILIKE '%(PHM)%'
        OR s.item_name_raw ILIKE '%LOOSE%'
    )
    GROUP BY s.barcode
"""

_EXISTING_PAIRS_SQL = """
    SELECT raw_barcode || '|' || finished_barcode AS pair
    FROM app.product_bom
    UNION ALL
    SELECT raw_barcode || '|' || finished_barcode AS pair
    FROM app.product_bom_suggestions
    WHERE status IN ('confirmed', 'rejected')
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(min_score: int = 70, dry_run: bool = False) -> None:
    with engine.connect() as conn:
        raw_rows = conn.execute(text(_RAW_CANDIDATES_SQL)).mappings().all()
        fin_rows = conn.execute(text(_FINISHED_CANDIDATES_SQL)).mappings().all()
        existing = {r["pair"] for r in conn.execute(text(_EXISTING_PAIRS_SQL)).mappings().all()}

    print(f"[suggest_bom] Raw candidates:      {len(raw_rows)}")
    print(f"[suggest_bom] Finished candidates: {len(fin_rows)}")

    raw_products  = [(r["barcode"], r["item_name"], base_name(r["item_name"])) for r in raw_rows]
    fin_products  = [(r["barcode"], r["item_name"], base_name(r["item_name"])) for r in fin_rows]

    suggestions = []
    for r_bc, r_name, r_base in raw_products:
        for f_bc, f_name, f_base in fin_products:
            pair = f"{r_bc}|{f_bc}"
            if pair in existing:
                continue
            if not r_base or not f_base:
                continue
            score = fuzz.token_sort_ratio(r_base, f_base)
            if score >= min_score:
                suggestions.append({
                    "id":               str(uuid.uuid4()),
                    "raw_barcode":      r_bc,
                    "raw_name":         r_name,
                    "finished_barcode": f_bc,
                    "finished_name":    f_name,
                    "similarity_score": score,
                    "status":           "pending",
                    "generated_at":     datetime.now(timezone.utc),
                })

    # De-duplicate within batch (keep highest score per pair)
    seen: dict[str, dict] = {}
    for s in suggestions:
        key = f"{s['raw_barcode']}|{s['finished_barcode']}"
        if key not in seen or s["similarity_score"] > seen[key]["similarity_score"]:
            seen[key] = s
    suggestions = list(seen.values())

    print(f"[suggest_bom] New suggestions:      {len(suggestions)} (score >= {min_score})")

    if dry_run:
        for s in sorted(suggestions, key=lambda x: -x["similarity_score"])[:30]:
            print(f"  {s['similarity_score']:5.1f}  {s['raw_name']:<35} -> {s['finished_name']}")
        return

    if not suggestions:
        print("[suggest_bom] Nothing to insert.")
        return

    insert_sql = text("""
        INSERT INTO app.product_bom_suggestions
            (id, raw_barcode, raw_name, finished_barcode, finished_name,
             similarity_score, status, generated_at)
        VALUES
            (:id, :raw_barcode, :raw_name, :finished_barcode, :finished_name,
             :similarity_score, :status, :generated_at)
        ON CONFLICT (raw_barcode, finished_barcode)
        DO UPDATE SET
            raw_name         = EXCLUDED.raw_name,
            finished_name    = EXCLUDED.finished_name,
            similarity_score = EXCLUDED.similarity_score,
            generated_at     = EXCLUDED.generated_at
        WHERE app.product_bom_suggestions.status = 'pending'
    """)

    with engine.begin() as conn:
        conn.execute(insert_sql, suggestions)

    print(f"[suggest_bom] Inserted/updated {len(suggestions)} suggestions.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-score", type=int, default=70)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(min_score=args.min_score, dry_run=args.dry_run)
