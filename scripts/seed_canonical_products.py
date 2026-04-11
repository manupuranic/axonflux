#!/usr/bin/env python3
"""
Seed app.products from raw.raw_item_combinations.

Reads the richest product identity data from the item master, computes canonical
names via cleanup, auto-suggests categories based on HSN codes, and inserts into
app.products. Idempotent: skips barcodes already present (staff corrections survive re-runs).

Usage:
    python -m scripts.seed_canonical_products [--dry-run] [--limit N]

Examples:
    python -m scripts.seed_canonical_products --dry-run --limit 20
    python -m scripts.seed_canonical_products
"""
import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text

# Add project root to sys.path so imports work from any directory
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from config.db import engine


# HSN Prefix → Category mapping (checked longest-first: 4-digit before 2-digit)
HSN_CATEGORY_MAP = {
    # 4-digit prefixes (checked first)
    "2009": "Juices",
    "1902": "Processed Grains",
    "1905": "Bakery",
    "3004": "Pharmaceuticals",
    "3401": "Soap & Detergent",
    "3402": "Soap & Detergent",
    # 2-digit prefixes
    "07": "Vegetables",
    "08": "Fruits & Nuts",
    "09": "Spices",
    "10": "Grains & Pulses",
    "15": "Oils & Fats",
    "16": "Preserved Foods",
    "17": "Sugar & Confectionery",
    "18": "Cocoa & Chocolate",
    "19": "Processed Grains",
    "20": "Canned & Preserved",
    "21": "Condiments & Sauces",
    "22": "Beverages",
    "24": "Tobacco",
    "30": "Pharmaceuticals",
    "33": "Personal Care",
    "34": "Soap & Detergent",
    "39": "Plastics & Packaging",
    "48": "Paper & Stationery",
    "61": "Clothing",
    "62": "Clothing",
    "63": "Textiles",
    "64": "Footwear",
    "85": "Electronics",
    "94": "Furniture & Fixtures",
}


def clean_canonical_name(raw: str | None) -> str | None:
    """
    Clean and title-case a raw product name.
    - Collapse internal whitespace
    - Title-case
    - Fix common title-case artifacts (And → and, The → the, etc.)
    - Re-capitalize after hyphens
    """
    if not raw or not str(raw).strip():
        return None
    name = str(raw).strip()
    # Collapse internal whitespace
    name = re.sub(r"\s+", " ", name)
    # Title-case
    name = name.title()
    # Fix common title-case artifacts
    for word in ("And", "Or", "Of", "The", "A", "An", "In", "On", "At", "To", "For"):
        name = re.sub(rf"\b{word}\b", word.lower(), name)
    # Re-capitalize after hyphen (e.g. "sugar-free" -> "Sugar-free")
    name = re.sub(r"(?<=-)\w", lambda m: m.group().upper(), name)
    return name


def suggest_category(hsn_code: str | None) -> str | None:
    """
    Auto-suggest a category based on HSN code prefix.
    Checks 4-digit prefix first, then 2-digit.
    """
    if not hsn_code:
        return None
    hsn = str(hsn_code).strip()
    # Check 4-digit prefix first, then 2-digit
    for length in (4, 2):
        prefix = hsn[:length]
        if prefix in HSN_CATEGORY_MAP:
            return HSN_CATEGORY_MAP[prefix]
    return None


def suggest_product_type(hsn_code: str | None, item_name: str | None) -> str:
    """
    Auto-suggest product type based on HSN code and item name keywords.
    - Keywords like 'labour', 'service', 'charge' → 'service'
    - No HSN → 'misc'
    - Everything else → 'retail'
    """
    name_lower = (item_name or "").lower()
    service_keywords = ("labour", "labor", "service", "charge", "fee", "delivery", "installation")
    if any(kw in name_lower for kw in service_keywords):
        return "service"
    if not hsn_code:
        return "misc"
    return "retail"


def seed(dry_run: bool = False, limit: int | None = None) -> None:
    """
    Seed app.products from raw_item_combinations.

    Args:
        dry_run: If True, print rows but don't insert
        limit: Limit rows for testing
    """
    limit_clause = f"LIMIT {limit}" if limit else ""

    fetch_sql = text(f"""
        SELECT DISTINCT ON (barcode)
            barcode,
            item_name_raw,
            brand_raw,
            hsn_code,
            size_raw,
            colour_raw
        FROM raw.raw_item_combinations
        WHERE barcode IS NOT NULL AND barcode != ''
        ORDER BY barcode, imported_at DESC
        {limit_clause}
    """)

    insert_sql = text("""
        INSERT INTO app.products (
            barcode, canonical_name, brand, hsn_code, size, colour,
            category, product_type, is_reviewed, is_active, created_at, updated_at
        ) VALUES (
            :barcode, :canonical_name, :brand, :hsn_code, :size, :colour,
            :category, :product_type, FALSE, TRUE, :now, :now
        )
        ON CONFLICT (barcode) DO NOTHING
    """)

    with engine.connect() as conn:
        rows = conn.execute(fetch_sql).mappings().all()
        print(f"[SEED] Found {len(rows)} distinct barcodes in raw_item_combinations")

        inserted = 0
        skipped = 0
        now = datetime.now(timezone.utc)

        for row in rows:
            barcode = row["barcode"]
            raw_name = row["item_name_raw"]
            canonical_name = clean_canonical_name(raw_name) or barcode

            params = {
                "barcode": barcode,
                "canonical_name": canonical_name,
                "brand": (row["brand_raw"] or "").strip() or None,
                "hsn_code": (row["hsn_code"] or "").strip() or None,
                "size": (row["size_raw"] or "").strip() or None,
                "colour": (row["colour_raw"] or "").strip() or None,
                "category": suggest_category(row["hsn_code"]),
                "product_type": suggest_product_type(row["hsn_code"], raw_name),
                "now": now,
            }

            if dry_run:
                print(
                    f"[DRY-RUN] {barcode} -> {canonical_name!r} | {params['category']} | {params['product_type']}"
                )
                inserted += 1
                continue

            result = conn.execute(insert_sql, params)
            if result.rowcount == 1:
                inserted += 1
            else:
                skipped += 1

        if not dry_run:
            conn.commit()

    print(f"[SEED] Done. Inserted={inserted}, Skipped (already existed)={skipped}")


def main():
    parser = argparse.ArgumentParser(description="Seed app.products from raw_item_combinations")
    parser.add_argument("--dry-run", action="store_true", help="Print rows, don't insert")
    parser.add_argument("--limit", type=int, default=None, help="Limit rows for testing")
    args = parser.parse_args()
    seed(dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    main()
