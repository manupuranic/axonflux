import argparse
import hashlib
import os
import shutil
from pathlib import Path
from typing import Callable

import pandas as pd
from sqlalchemy import inspect, select
from sqlalchemy.dialects.postgresql import insert

from db.db import DB
from raw_ingestion.item_combinations import ingest as ingest_item_combinations
from raw_ingestion.purchase_billwise import ingest as ingest_purchase_billwise
from raw_ingestion.purchase_itemwise import ingest as ingest_purchase_itemwise
from raw_ingestion.sales_billwise import ingest as ingest_sales_billwise
from raw_ingestion.sales_itemwise import ingest as ingest_sales_itemwise
from raw_ingestion.supplier_master import ingest as ingest_supplier_master
from raw_ingestion.common.validators import IngestionValidationError
from raw_models.ingestion_batches import RawIngestionBatch


BASE_INCOMING_DIR = Path("data/incoming")
BASE_PROCESSED_DIR = Path("data/processed")
ENV_INCOMING_KEYS = ("LEDGERAI_INCOMING_DIR", "INCOMING_DIR")
ENV_PROCESSED_KEYS = ("LEDGERAI_PROCESSED_DIR", "PROCESSED_DIR")


class ReportConfig:
    def __init__(
        self,
        ingest_fn: Callable[[str], None],
        reader: Callable[[Path], pd.DataFrame],
        drop_last_row: bool,
    ) -> None:
        self.ingest_fn = ingest_fn
        self.reader = reader
        self.drop_last_row = drop_last_row


def read_sales_itemwise(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, skiprows=2, header=0)
    if suffix == ".csv":
        return pd.read_csv(path)
    raise ValueError(f"Unsupported sales_itemwise file type: {path.suffix}")


def read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path)


def read_excel(path: Path) -> pd.DataFrame:
    return pd.read_excel(path)


REPORT_CONFIGS: dict[str, ReportConfig] = {
    "sales_itemwise": ReportConfig(
        ingest_fn=ingest_sales_itemwise,
        reader=read_sales_itemwise,
        drop_last_row=False,
    ),
    "sales_billwise": ReportConfig(
        ingest_fn=ingest_sales_billwise,
        reader=read_csv,
        drop_last_row=True,
    ),
    "purchase_itemwise": ReportConfig(
        ingest_fn=ingest_purchase_itemwise,
        reader=read_csv,
        drop_last_row=True,
    ),
    "purchase_billwise": ReportConfig(
        ingest_fn=ingest_purchase_billwise,
        reader=read_csv,
        drop_last_row=True,
    ),
    "supplier_master": ReportConfig(
        ingest_fn=ingest_supplier_master,
        reader=read_csv,
        drop_last_row=False,
    ),
    "item_combinations": ReportConfig(
        ingest_fn=ingest_item_combinations,
        reader=read_excel,
        drop_last_row=False,
    ),
}


def iter_report_files(incoming_dir: Path):
    for report_type in REPORT_CONFIGS:
        report_dir = incoming_dir / report_type
        if not report_dir.exists():
            continue

        for file_path in sorted(report_dir.iterdir()):
            if file_path.is_file():
                yield report_type, file_path


def compute_file_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with file_path.open("rb") as file_obj:
        while True:
            chunk = file_obj.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def ingestion_batch_exists(conn, file_hash: str) -> bool:
    stmt = (
        select(RawIngestionBatch.id)
        .where(RawIngestionBatch.file_hash == file_hash)
        .limit(1)
    )
    return conn.execute(stmt).scalar() is not None


def get_ingestion_batch_columns(conn) -> set[str]:
    inspector = inspect(conn)
    columns = inspector.get_columns("ingestion_batches", schema="raw")
    return {column["name"] for column in columns}


def insert_ingestion_batch(
    conn,
    *,
    batch_columns: set[str],
    file_name: str,
    file_hash: str,
    report_type: str,
    row_count: int | None,
    status: str,
    error_message: str | None = None,
) -> None:
    payload = {
        "file_name": file_name,
        "file_hash": file_hash,
        "report_type": report_type,
        "row_count": row_count,
        "status": status,
    }

    if "error_message" in batch_columns:
        payload["error_message"] = error_message

    insert_columns = ", ".join(payload.keys())
    if not insert_columns:
        return

    stmt = insert(RawIngestionBatch).values(payload).on_conflict_do_nothing(
        index_elements=["file_hash"]
    )
    conn.execute(stmt)


def estimate_row_count(report_type: str, file_path: Path) -> int:
    config = REPORT_CONFIGS[report_type]
    df = config.reader(file_path)
    if config.drop_last_row:
        df = df[:-1]
    return len(df)


def dispatch_ingestion(report_type: str, file_path: Path) -> None:
    REPORT_CONFIGS[report_type].ingest_fn(str(file_path))


def move_to_processed(file_path: Path, processed_base: Path, report_type: str) -> Path:
    destination_dir = processed_base / report_type
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination_path = destination_dir / file_path.name
    shutil.move(str(file_path), str(destination_path))
    return destination_path


def process_file(
    *,
    conn,
    batch_columns: set[str],
    report_type: str,
    file_path: Path,
    dry_run: bool,
    processed_base: Path,
) -> None:
    file_hash = compute_file_sha256(file_path)
    if ingestion_batch_exists(conn, file_hash):
        print(f"[SKIP] {report_type}: {file_path.name} (hash already ingested)")
        return

    if dry_run:
        print(f"[DRY-RUN] Would process {report_type}: {file_path.name}")
        return

    print(f"[PROCESS] {report_type}: {file_path.name}")

    try:
        row_count = estimate_row_count(report_type, file_path)
        dispatch_ingestion(report_type, file_path)
        insert_ingestion_batch(
            conn,
            batch_columns=batch_columns,
            file_name=file_path.name,
            file_hash=file_hash,
            report_type=report_type,
            row_count=row_count,
            status="SUCCESS",
        )
    except IngestionValidationError as exc:
        print(f"[FAILED][VALIDATION] {report_type}: {file_path.name} :: {exc}")
        insert_ingestion_batch(
            conn,
            batch_columns=batch_columns,
            file_name=file_path.name,
            file_hash=file_hash,
            report_type=report_type,
            row_count=None,
            status="FAILED",
            error_message=str(exc),
        )
        return
    except Exception as exc:
        print(f"[FAILED] {report_type}: {file_path.name} :: {exc}")
        insert_ingestion_batch(
            conn,
            batch_columns=batch_columns,
            file_name=file_path.name,
            file_hash=file_hash,
            report_type=report_type,
            row_count=None,
            status="FAILED",
            error_message=str(exc),
        )
        return

    try:
        destination_path = move_to_processed(file_path, processed_base, report_type)
        print(
            f"[SUCCESS] {report_type}: {file_path.name} -> {destination_path.as_posix()}"
        )
    except Exception as exc:
        print(
            f"[MOVE-FAILED] {report_type}: {file_path.name} :: {exc} "
            "(ingestion already marked SUCCESS)"
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Run ingestion for all incoming reports.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which files would be processed without inserting or moving files.",
    )
    parser.add_argument(
        "--incoming-dir",
        type=Path,
        default=None,
        help=(
            "Incoming root directory. "
            f"Fallback order: {ENV_INCOMING_KEYS} -> {BASE_INCOMING_DIR}"
        ),
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=None,
        help=(
            "Processed root directory. "
            f"Fallback order: {ENV_PROCESSED_KEYS} -> {BASE_PROCESSED_DIR}"
        ),
    )
    return parser.parse_args()


def get_path_from_env(keys: tuple[str, ...], fallback: Path) -> Path:
    for key in keys:
        value = os.getenv(key)
        if value:
            return Path(value)
    return fallback


def main() -> None:
    args = parse_args()

    incoming_dir = args.incoming_dir or get_path_from_env(
        ENV_INCOMING_KEYS, BASE_INCOMING_DIR
    )
    processed_dir = args.processed_dir or get_path_from_env(
        ENV_PROCESSED_KEYS, BASE_PROCESSED_DIR
    )

    if not incoming_dir.exists():
        print(f"[INFO] Incoming directory not found: {incoming_dir.as_posix()}")
        return

    db = DB()
    with db.connection() as conn:
        batch_columns = get_ingestion_batch_columns(conn)
        for report_type, file_path in iter_report_files(incoming_dir):
            process_file(
                conn=conn,
                batch_columns=batch_columns,
                report_type=report_type,
                file_path=file_path,
                dry_run=args.dry_run,
                processed_base=processed_dir,
            )


if __name__ == "__main__":
    main()
