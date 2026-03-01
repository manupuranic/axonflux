import argparse
import re
import shutil
from pathlib import Path


BASE_BACKFILLS_EVENTS_DIR = Path("data/backfills/events")
BASE_INCOMING_SALES_ITEMWISE_DIR = Path("data/incoming/sales_itemwise")
MONTH_DIR_PATTERN = re.compile(r"^\d{4}-\d{2}$")


def find_sales_itemwise_files(month_dir: Path) -> list[Path]:
    files: list[Path] = []
    for file_path in sorted(month_dir.iterdir()):
        if not file_path.is_file():
            continue
        if "sales-itemwise" not in file_path.name.lower():
            continue
        files.append(file_path)
    return files


def month_to_target_prefix(month_dir_name: str) -> str:
    year, month = month_dir_name.split("-")
    return f"{month}{year}"


def copy_sales_itemwise_files(
    *,
    source_events_dir: Path,
    target_incoming_dir: Path,
    overwrite: bool,
    dry_run: bool,
) -> int:
    if not source_events_dir.exists():
        print(f"[INFO] Source events directory not found: {source_events_dir.as_posix()}")
        return 0

    target_incoming_dir.mkdir(parents=True, exist_ok=True)

    copied_count = 0
    for month_dir in sorted(source_events_dir.iterdir()):
        if not month_dir.is_dir():
            continue
        if not MONTH_DIR_PATTERN.match(month_dir.name):
            continue

        sales_files = find_sales_itemwise_files(month_dir)
        if not sales_files:
            continue

        month_prefix = month_to_target_prefix(month_dir.name)
        for index, source_file in enumerate(sales_files, start=1):
            extension = source_file.suffix.lower()
            target_name = f"{month_prefix}-sales-itemwise-{index}{extension}"
            target_path = target_incoming_dir / target_name

            if target_path.exists() and not overwrite:
                print(
                    f"[SKIP] Exists (use --overwrite): "
                    f"{target_path.as_posix()}"
                )
                continue

            if dry_run:
                print(f"[DRY-RUN] {source_file.as_posix()} -> {target_path.as_posix()}")
            else:
                shutil.copy2(source_file, target_path)
                print(f"[COPIED] {source_file.as_posix()} -> {target_path.as_posix()}")
            copied_count += 1

    return copied_count


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Copy sales-itemwise backfill files from monthly events folders into "
            "incoming/sales_itemwise for reingestion."
        )
    )
    parser.add_argument(
        "--source-events-dir",
        type=Path,
        default=BASE_BACKFILLS_EVENTS_DIR,
        help=f"Source events folder (default: {BASE_BACKFILLS_EVENTS_DIR.as_posix()})",
    )
    parser.add_argument(
        "--target-incoming-dir",
        type=Path,
        default=BASE_INCOMING_SALES_ITEMWISE_DIR,
        help=(
            "Target incoming sales_itemwise folder "
            f"(default: {BASE_INCOMING_SALES_ITEMWISE_DIR.as_posix()})"
        ),
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite target files if they already exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned copy operations without writing files.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    copied = copy_sales_itemwise_files(
        source_events_dir=args.source_events_dir,
        target_incoming_dir=args.target_incoming_dir,
        overwrite=args.overwrite,
        dry_run=args.dry_run,
    )
    mode = "planned" if args.dry_run else "copied"
    print(f"[DONE] {mode} {copied} sales-itemwise file(s).")


if __name__ == "__main__":
    main()
