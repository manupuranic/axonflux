"""
Product name clustering for entity resolution (Phase B3).

Collects one representative name per barcode from raw tables, normalizes them,
blocks into prefix+numeric groups, runs RapidFuzz token_sort_ratio within each
block, builds Union-Find clusters over transitive pairs, and persists pending
merge suggestions to app.product_merge_suggestions.

Usage:
    python scripts/cluster_product_names.py [--min-score 62] [--dry-run]

With --dry-run: prints clusters to stdout, does not write to DB.
"""

import argparse
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import text

sys.path.insert(0, ".")
from config.db import engine


# ---------------------------------------------------------------------------
# Name normalisation
# ---------------------------------------------------------------------------

_UNIT_FIXES = [
    (re.compile(r"(\d)(KG|KGS)\b",  re.I), r"\1 KG"),
    (re.compile(r"(\d)(GM|GMS|GR)\b", re.I), r"\1 G"),
    (re.compile(r"(\d)(LTR|LT|LTS|L)\b", re.I), r"\1 L"),
    (re.compile(r"(\d)(ML|MLS)\b",  re.I), r"\1 ML"),
    (re.compile(r"(\d)(PCS|PC)\b",  re.I), r"\1 PCS"),
]
_NOISE_TOKENS = {"CO", "LTD", "PVT", "MFG", "INDIA", "PVT"}
_PUNCT = re.compile(r"[^\w\s\-]")
_WHITESPACE = re.compile(r"\s+")


def normalize(name: str) -> str:
    s = name.upper()
    for pattern, replacement in _UNIT_FIXES:
        s = pattern.sub(replacement, s)
    s = _PUNCT.sub(" ", s)
    tokens = [t for t in s.split() if t not in _NOISE_TOKENS]
    return _WHITESPACE.sub(" ", " ".join(tokens)).strip()


def extract_numeric(name: str) -> str:
    """Extract first numeric token (e.g. '500' from 'DETTOL 500 ML')."""
    m = re.search(r"\d+", name)
    return m.group(0) if m else ""


# ---------------------------------------------------------------------------
# Union-Find
# ---------------------------------------------------------------------------

class UnionFind:
    def __init__(self):
        self._parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        if x not in self._parent:
            self._parent[x] = x
        if self._parent[x] != x:
            self._parent[x] = self.find(self._parent[x])
        return self._parent[x]

    def union(self, x: str, y: str) -> None:
        self._parent[self.find(x)] = self.find(y)

    def clusters(self, members: list[str]) -> dict[str, list[str]]:
        result: dict[str, list[str]] = defaultdict(list)
        for m in members:
            result[self.find(m)].append(m)
        return {k: v for k, v in result.items() if len(v) > 1}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_candidates(conn) -> dict[str, str]:
    """Return {barcode: item_name_raw} — most-recent name, already-aliased barcodes excluded."""
    rows = conn.execute(text("""
        WITH already_aliased AS (
            SELECT alias_barcode FROM app.product_aliases
        ),
        item_master AS (
            SELECT DISTINCT ON (barcode) barcode, item_name_raw
            FROM raw.raw_item_combinations
            WHERE item_name_raw IS NOT NULL AND item_name_raw != ''
            ORDER BY barcode, imported_at DESC
        ),
        sales_fallback AS (
            SELECT DISTINCT ON (barcode) barcode, item_name_raw
            FROM raw.raw_sales_itemwise
            WHERE item_name_raw IS NOT NULL AND item_name_raw != ''
            ORDER BY barcode, imported_at DESC
        ),
        all_barcodes AS (
            SELECT DISTINCT barcode FROM item_master
            UNION
            SELECT DISTINCT barcode FROM sales_fallback
        )
        SELECT
            ab.barcode,
            COALESCE(im.item_name_raw, sf.item_name_raw) AS name
        FROM all_barcodes ab
        LEFT JOIN item_master   im ON ab.barcode = im.barcode
        LEFT JOIN sales_fallback sf ON ab.barcode = sf.barcode
        WHERE ab.barcode NOT IN (SELECT alias_barcode FROM already_aliased)
          AND COALESCE(im.item_name_raw, sf.item_name_raw) IS NOT NULL
    """)).fetchall()
    return {r.barcode: r.name for r in rows}


def load_app_product_barcodes(conn) -> set[str]:
    """Return set of barcodes that already have an app.products row."""
    rows = conn.execute(text("SELECT barcode FROM app.products")).fetchall()
    return {r.barcode for r in rows}


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------

def build_blocks(candidates: dict[str, str]) -> dict[str, list[tuple[str, str]]]:
    """
    Group (barcode, normalized_name) by (first-3-chars prefix + numeric token).
    This keeps each cdist block small and avoids the O(N²) memory spike.
    """
    blocks: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for barcode, raw_name in candidates.items():
        norm = normalize(raw_name)
        prefix = norm[:3] if len(norm) >= 3 else norm.ljust(3, "_")
        numeric = extract_numeric(norm)
        key = f"{prefix}|{numeric}"
        blocks[key].append((barcode, norm))
    # Only keep blocks with ≥2 members (single items can't form pairs)
    return {k: v for k, v in blocks.items() if len(v) >= 2}


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def find_pairs(blocks: dict[str, list[tuple[str, str]]], min_score: int) -> list[tuple[str, str, float]]:
    """
    Run RapidFuzz cdist within each block. Return list of (barcode_a, barcode_b, score).
    Import RapidFuzz here so the module is importable even without it installed
    (fails gracefully at runtime with a clear message).
    """
    try:
        from rapidfuzz import process, fuzz
        import numpy as np
    except ImportError:
        print("ERROR: rapidfuzz not installed. Run: pip install rapidfuzz>=3.0", file=sys.stderr)
        sys.exit(1)

    pairs: list[tuple[str, str, float]] = []
    for block_key, members in blocks.items():
        if len(members) < 2:
            continue
        barcodes = [m[0] for m in members]
        names    = [m[1] for m in members]
        matrix = process.cdist(names, names, scorer=fuzz.token_sort_ratio)
        n = len(names)
        for i in range(n):
            for j in range(i + 1, n):
                score = float(matrix[i][j])
                if score >= min_score:
                    pairs.append((barcodes[i], barcodes[j], score))
    return pairs


def build_clusters(
    pairs: list[tuple[str, str, float]],
    candidates: dict[str, str],
    app_barcodes: set[str],
) -> list[dict]:
    """
    Build Union-Find clusters from transitive pairs.
    For each cluster, pick canonical = member with app.products row first,
    else most-frequent barcode (by raw name occurrence count — approximated by
    lexicographic order for simplicity since we lack occurrence counts here).
    Returns list of suggestion dicts ready for DB insert.
    """
    uf = UnionFind()
    pair_scores: dict[tuple[str, str], float] = {}
    for a, b, score in pairs:
        uf.union(a, b)
        pair_scores[(min(a, b), max(a, b))] = score

    clusters = uf.clusters(list(candidates.keys()))
    suggestions = []

    for root, members in clusters.items():
        # Pick canonical: prefer one with app.products row, else lex-first
        canonical = next(
            (m for m in sorted(members) if m in app_barcodes),
            sorted(members)[0],
        )
        cluster_key = canonical

        for alias in members:
            if alias == canonical:
                continue
            score = pair_scores.get(
                (min(alias, canonical), max(alias, canonical)), 0.0
            )
            suggestions.append({
                "id": str(uuid.uuid4()),
                "cluster_key": cluster_key,
                "alias_barcode": alias,
                "canonical_candidate": canonical,
                "alias_name": candidates.get(alias),
                "canonical_name": candidates.get(canonical),
                "similarity_score": score,
            })

    return suggestions


# ---------------------------------------------------------------------------
# DB persistence
# ---------------------------------------------------------------------------

def persist_suggestions(conn, suggestions: list[dict]) -> None:
    now = datetime.now(timezone.utc)
    # Truncate only pending rows — keep confirmed/rejected for audit
    conn.execute(text(
        "DELETE FROM app.product_merge_suggestions WHERE status = 'pending'"
    ))
    if not suggestions:
        print("No suggestions to insert.")
        return

    conn.execute(
        text("""
            INSERT INTO app.product_merge_suggestions
                (id, cluster_key, alias_barcode, canonical_candidate,
                 alias_name, canonical_name, similarity_score, status, generated_at)
            VALUES
                (:id, :cluster_key, :alias_barcode, :canonical_candidate,
                 :alias_name, :canonical_name, :similarity_score, 'pending', :generated_at)
            ON CONFLICT (alias_barcode, canonical_candidate) DO UPDATE SET
                cluster_key      = EXCLUDED.cluster_key,
                alias_name       = EXCLUDED.alias_name,
                canonical_name   = EXCLUDED.canonical_name,
                similarity_score = EXCLUDED.similarity_score,
                status           = 'pending',
                generated_at     = EXCLUDED.generated_at
        """),
        [{**s, "generated_at": now} for s in suggestions],
    )
    print(f"Inserted/updated {len(suggestions)} pending suggestions.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Cluster product names for entity resolution")
    parser.add_argument("--min-score", type=int, default=62,
                        help="Minimum token_sort_ratio score to consider a pair (default: 62)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print clusters to stdout without writing to DB")
    args = parser.parse_args()

    print(f"Loading product candidates (min_score={args.min_score})...")
    with engine.connect() as conn:
        candidates = load_candidates(conn)
        app_barcodes = load_app_product_barcodes(conn)

    print(f"  {len(candidates)} candidate barcodes loaded.")

    blocks = build_blocks(candidates)
    print(f"  {len(blocks)} comparison blocks built.")

    pairs = find_pairs(blocks, args.min_score)
    print(f"  {len(pairs)} above-threshold pairs found.")

    suggestions = build_clusters(pairs, candidates, app_barcodes)
    print(f"  {len(suggestions)} suggestions in {len({s['cluster_key'] for s in suggestions})} clusters.")

    if args.dry_run:
        clusters_by_key: dict[str, list[dict]] = defaultdict(list)
        for s in suggestions:
            clusters_by_key[s["cluster_key"]].append(s)
        for key, members in sorted(clusters_by_key.items(), key=lambda x: -len(x[1])):
            canonical_name = members[0]["canonical_name"] or key
            print(f"\nCluster: {key} — {canonical_name}")
            for m in members:
                print(f"  alias={m['alias_barcode']}  name={m['alias_name']}  score={m['similarity_score']:.1f}")
        print(f"\n[dry-run] {len(suggestions)} suggestions NOT written to DB.")
        return

    with engine.begin() as conn:
        persist_suggestions(conn, suggestions)
    print("Done.")


if __name__ == "__main__":
    main()
