"""
Reset demo environment: wipe raw data, reload generated demo data, run full pipeline.

WARNING: Destructive. All raw.* data will be erased and rebuilt from scratch.
         Run only against a local or staging database — never production.

Steps performed:
  1. Truncate all raw.* tables (including ingestion_batches)
  2. Generate 6 months of synthetic FMCG data (Oct 2025 – Mar 2026)
  3. Copy generated CSVs → data/incoming/
  4. Run ingest_all.py (ingests + moves files to data/processed/)
  5. Run weekly_pipeline.py (rebuilds all derived.* tables)

Usage:
    PYTHONPATH=. python scripts/demo_reset.py           # prompts for confirmation
    PYTHONPATH=. python scripts/demo_reset.py --yes     # skip prompt (CI / staging)
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Load the env file BEFORE config.db is imported (load_dotenv runs on import).
# Pass --env .env.demo to target the demo database.
_pre = argparse.ArgumentParser(add_help=False)
_pre.add_argument("--env", default=".env")
_pre_args, _ = _pre.parse_known_args()

from dotenv import load_dotenv
load_dotenv(_pre_args.env, override=True)

sys.path.insert(0, ".")
from config.db import engine
from sqlalchemy import text


SAMPLE_DIR   = Path("data/sample")
INCOMING_DIR = Path("data/incoming")

_TRUNCATE_RAW = text("""
TRUNCATE
    raw.ingestion_batches,
    raw.raw_sales_itemwise,
    raw.raw_sales_billwise,
    raw.raw_purchase_itemwise,
    raw.raw_purchase_billwise,
    raw.raw_supplier_master,
    raw.raw_item_combinations
RESTART IDENTITY CASCADE
""")


def _run(cmd: list[str]) -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = "."
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        print(f"\nFailed: {' '.join(cmd)}")
        sys.exit(result.returncode)


def confirm() -> None:
    print("=" * 62)
    print("  WARNING: This will DELETE all data in raw.* tables.")
    print("  Use only on a local or staging database.")
    print("=" * 62)
    ans = input("  Type YES to continue: ").strip()
    if ans != "YES":
        print("Aborted.")
        sys.exit(0)


def truncate_raw() -> None:
    print("\n[1/6] Truncating raw.* tables...")
    with engine.begin() as conn:
        conn.execute(_TRUNCATE_RAW)
    print("      Done.")


def generate_data() -> None:
    from datetime import date
    today = date.today().isoformat()
    print(f"\n[2/6] Generating demo data (Oct 2025 – {today})...")
    _run([sys.executable, "scripts/generate_demo_data.py",
          "--start", "2025-10-01", "--end", today])


def copy_to_incoming() -> None:
    print("\n[3/6] Copying demo CSVs → data/incoming/ ...")
    for folder in SAMPLE_DIR.iterdir():
        if not folder.is_dir():
            continue
        dest = INCOMING_DIR / folder.name
        dest.mkdir(parents=True, exist_ok=True)
        for f in folder.glob("*.csv"):
            shutil.copy(f, dest / f.name)
            print(f"      {f.name}")


def ingest() -> None:
    print("\n[4/6] Ingesting all demo files...")
    _run([sys.executable, "scripts/ingest_all.py"])


def seed_calendar() -> None:
    print("\n[5/6] Seeding derived.calendar_dim (Indian holidays + festivals)...")
    _run([sys.executable, "scripts/seed_calendar.py"])


def run_pipeline() -> None:
    print("\n[6/6] Rebuilding all derived.* tables...")
    _run([sys.executable, "pipelines/weekly_pipeline.py"])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset and reload the demo database."
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Skip confirmation prompt (use in CI / staging scripts)"
    )
    parser.add_argument(
        "--env", default=".env",
        help="Path to .env file (default: .env). Use .env.demo for demo database."
    )
    args = parser.parse_args()

    if not args.yes:
        confirm()

    truncate_raw()
    generate_data()
    copy_to_incoming()
    ingest()
    seed_calendar()
    run_pipeline()

    print("\n" + "=" * 62)
    print("  Demo environment ready.")
    print()
    print("  Start API:")
    print("    PYTHONPATH=. python -m uvicorn api.main:app --reload \\")
    print("      --host 0.0.0.0 --port 8000")
    print()
    print("  Start frontend:")
    print("    cd web && npm run dev")
    print()
    print("  First time? Create admin user:")
    print("    PYTHONPATH=. python scripts/create_admin.py")
    print("=" * 62)


if __name__ == "__main__":
    main()
