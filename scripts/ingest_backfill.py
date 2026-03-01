from pathlib import Path
import sys

from raw_ingestion.item_combinations import ingest as ic_ingest
from raw_ingestion.supplier_master import ingest as sm_ingest

from raw_ingestion.sales_billwise import ingest as sb_ingest
from raw_ingestion.sales_itemwise import ingest as si_ingest
from raw_ingestion.purchase_billwise import ingest as pb_ingest
from raw_ingestion.purchase_itemwise import ingest as pi_ingest
from raw_ingestion.common.validators import IngestionValidationError


BASE_DIR = Path("data/backfills")


def ingest_with_guardrails(file: Path, ingest_fn) -> None:
    try:
        ingest_fn(str(file))
    except IngestionValidationError as exc:
        print(f"[FAILED] Schema validation failed for {file.name}: {exc}")
    except Exception:
        raise


def ingest_snapshots():
    print("\n=== INGESTING SNAPSHOTS ===")

    snapshots_dir = BASE_DIR / "snapshots"

    supplier_dir = snapshots_dir / "supplier_master"
    if supplier_dir.exists():
        for file in sorted(supplier_dir.iterdir()):
            if file.is_file():
                print(f"\n[SNAPSHOT] Supplier master → {file.name}")
                ingest_with_guardrails(file, sm_ingest)

    item_dir = snapshots_dir / "item_combinations"
    if item_dir.exists():
        for file in sorted(item_dir.iterdir()):
            if file.is_file():
                print(f"\n[SNAPSHOT] Item combinations → {file.name}")
                ingest_with_guardrails(file, ic_ingest)


def ingest_events():
    print("\n=== INGESTING EVENT DATA ===")

    events_dir = BASE_DIR / "events"

    for month_dir in sorted(events_dir.iterdir()):
        if not month_dir.is_dir():
            continue

        print(f"\n=== MONTH {month_dir.name} ===")

        for file in sorted(month_dir.iterdir()):
            if not file.is_file():
                continue

            fname = file.name.lower()

            print(f"\n[EVENT] Processing {file.name}")

            if "sales-itemwise" in fname:
                ingest_with_guardrails(file, si_ingest)

            elif "sales-billwise" in fname:
                ingest_with_guardrails(file, sb_ingest)

            elif "purchase-itemwise" in fname:
                ingest_with_guardrails(file, pi_ingest)

            elif "purchase-billwise" in fname:
                ingest_with_guardrails(file, pb_ingest)

            else:
                print(f"[SKIP] Unrecognized file: {file.name}")
 
              
def ingest_from_folder(folder_path: str):
    print(f"\n=== INGESTING FROM FOLDER: {folder_path} ===")
    folder_dir = Path(folder_path)

    for file in sorted(folder_dir.iterdir()):
        if not file.is_file():
            continue

        fname = file.name.lower()

        print(f"\n[EVENT] Processing {file.name}")

        if "sales-itemwise" in fname:
            ingest_with_guardrails(file, si_ingest)

        elif "sales-billwise" in fname:
            ingest_with_guardrails(file, sb_ingest)

        elif "purchase-itemwise" in fname:
            ingest_with_guardrails(file, pi_ingest)

        elif "purchase-billwise" in fname:
            ingest_with_guardrails(file, pb_ingest)

        else:
            print(f"[SKIP] Unrecognized file: {file.name}")


def main():
    try:
        # ingest_snapshots()
        # ingest_events()
        ingest_from_folder("data/backfills/events/2026-01-24")
    except Exception as e:
        print("\n[ERROR] Backfill failed")
        print(e)
        sys.exit(1)

    print("\n=== BACKFILL COMPLETE ===")


if __name__ == "__main__":
    main()
