"""
Fetch product images from Open Food Facts, upload to storage (R2 or local),
store CDN URL in app.products.image_url.

Usage:
    PYTHONPATH=. python scripts/fetch_product_images.py               # all products without image
    PYTHONPATH=. python scripts/fetch_product_images.py --limit 100   # first 100
    PYTHONPATH=. python scripts/fetch_product_images.py --overwrite   # re-fetch all
    PYTHONPATH=. python scripts/fetch_product_images.py --dry-run     # log hits without uploading
"""

import argparse
import time
import sys
from pathlib import Path

import requests
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parents[1]))

from config.db import engine
from api.storage.client import get_storage_client

OFF_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
HEADERS = {"User-Agent": "AxonFlux/1.0 (manupuranic@gmail.com)"}
DELAY_SECONDS = 0.3  # be polite to OFF servers


def fetch_off_image_url(barcode: str) -> str | None:
    """Return best image URL from Open Food Facts or None."""
    try:
        resp = requests.get(OFF_API.format(barcode=barcode), headers=HEADERS, timeout=8)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") != 1:
            return None
        product = data.get("product", {})
        # Prefer front image in English, fall back to any available image
        return (
            product.get("image_front_url")
            or product.get("image_url")
            or None
        )
    except Exception:
        return None


def download_image(url: str) -> tuple[bytes, str] | None:
    """Download image bytes and content_type. Returns None on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
        return resp.content, content_type
    except Exception:
        return None


def ext_from_content_type(ct: str) -> str:
    return {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(ct, "jpg")


def run(limit: int | None, overwrite: bool, dry_run: bool) -> None:
    storage = get_storage_client()

    with engine.connect() as conn:
        # Only EAN-13 barcodes — short codes are internal store codes OFF won't have
        ean13_filter = "length(barcode) = 13"
        where = f"WHERE {ean13_filter}" if overwrite else f"WHERE image_url IS NULL AND {ean13_filter}"
        limit_clause = f"LIMIT {limit}" if limit else ""
        rows = conn.execute(
            text(f"SELECT barcode FROM app.products {where} ORDER BY barcode {limit_clause}")
        ).fetchall()

    barcodes = [r[0] for r in rows]
    print(f"Processing {len(barcodes)} products (overwrite={overwrite}, dry_run={dry_run})")

    hits = skips = errors = 0

    for i, barcode in enumerate(barcodes, 1):
        image_source_url = fetch_off_image_url(barcode)
        if not image_source_url:
            skips += 1
            print(f"[{i}/{len(barcodes)}] {barcode} — no OFF image")
            time.sleep(DELAY_SECONDS)
            continue

        result = download_image(image_source_url)
        if not result:
            errors += 1
            print(f"[{i}/{len(barcodes)}] {barcode} — download failed: {image_source_url}")
            time.sleep(DELAY_SECONDS)
            continue

        data, content_type = result
        ext = ext_from_content_type(content_type)
        key = f"products/{barcode}.{ext}"

        if dry_run:
            hits += 1
            print(f"[{i}/{len(barcodes)}] {barcode} — DRY RUN hit: {image_source_url}")
            time.sleep(DELAY_SECONDS)
            continue

        cdn_url = storage.upload(key, data, content_type)

        with engine.begin() as conn:
            conn.execute(
                text("UPDATE app.products SET image_url = :url WHERE barcode = :barcode"),
                {"url": cdn_url, "barcode": barcode},
            )

        hits += 1
        print(f"[{i}/{len(barcodes)}] {barcode} — uploaded → {cdn_url}")
        time.sleep(DELAY_SECONDS)

    print(f"\nDone. hits={hits} skips={skips} errors={errors}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(args.limit, args.overwrite, args.dry_run)
