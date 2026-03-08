#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from db.db import run_sql_file
from raw_ingestion.item_combinations import ingest as ingest_item_combinations_module
from raw_ingestion.purchase_billwise import ingest as ingest_purchase_billwise_module
from raw_ingestion.purchase_itemwise import ingest as ingest_purchase_itemwise_module
from raw_ingestion.sales_billwise import ingest as ingest_sales_billwise_module
from raw_ingestion.sales_itemwise import ingest as ingest_sales_itemwise_module
from raw_ingestion.supplier_master import ingest as ingest_supplier_master_module

ROOT = Path(__file__).resolve().parents[1]
SQL_ROOT = ROOT / "sql"
REBUILD_SQL_DIR = SQL_ROOT / "rebuild_derived"
SHEETS_SQL_DIR = SQL_ROOT / "sheets"
EXPORTS_DIR = ROOT / "exports"
SUPPLIER_EXPORT_DIR = EXPORTS_DIR / "supplier_orders"

REBUILD_SQL_FILES = [
    REBUILD_SQL_DIR / "01_product_daily_metrics.sql",
    REBUILD_SQL_DIR / "02_product_daily_features.sql",
    REBUILD_SQL_DIR / "03_product_health_signals.sql",
    REBUILD_SQL_DIR / "04_product_stock_position.sql",
    REBUILD_SQL_DIR / "05_necessary_views.sql",
    REBUILD_SQL_DIR / "06_supplier_restock_recommendations.sql",
]

SHEET_SQL_FILES = [
    SHEETS_SQL_DIR / "replenishment_sheet.sql",
    SHEETS_SQL_DIR / "conversion_attention_sheet.sql",
]


load_dotenv()


def get_engine_from_env() -> Engine:
    host = os.getenv("host")
    port = os.getenv("port")
    user = os.getenv("user")
    password = quote_plus(os.getenv("password"))
    db_name = os.getenv("dbname")

    database_url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"
    return create_engine(database_url, future=True, pool_pre_ping=True)


def _find_latest_file(directory: Path) -> Path:
    files = [p for p in directory.iterdir() if p.is_file()]
    if not files:
        raise FileNotFoundError(f"No files found in {directory}")
    return max(files, key=lambda p: p.stat().st_mtime)


def _ingest_latest_report(report_type: str, ingest_fn) -> None:
    incoming_base = Path(
        os.getenv("LEDGERAI_INCOMING_DIR")
        or os.getenv("INCOMING_DIR")
        or ROOT / "data" / "incoming"
    )
    report_dir = incoming_base / report_type
    if not report_dir.exists():
        print(f"[INGEST][SKIP] Missing folder: {report_dir}")
        return

    latest_file = _find_latest_file(report_dir)
    print(f"[INGEST] {report_type}: {latest_file.name}")
    ingest_fn(str(latest_file))


def ingest_sales_itemwise() -> None:
    _ingest_latest_report("sales_itemwise", ingest_sales_itemwise_module)


def ingest_sales_billwise() -> None:
    _ingest_latest_report("sales_billwise", ingest_sales_billwise_module)


def ingest_purchase_itemwise() -> None:
    _ingest_latest_report("purchase_itemwise", ingest_purchase_itemwise_module)


def ingest_purchase_billwise() -> None:
    _ingest_latest_report("purchase_billwise", ingest_purchase_billwise_module)


def ingest_supplier_master() -> None:
    _ingest_latest_report("supplier_master", ingest_supplier_master_module)


def ingest_item_combinations() -> None:
    _ingest_latest_report("item_combinations", ingest_item_combinations_module)


def export_supplier_sheets(engine: Engine) -> None:
    SUPPLIER_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    suppliers_df = pd.read_sql(
        text("SELECT DISTINCT supplier_name FROM derived.replenishment_sheet"),
        con=engine,
    )

    for supplier_name in suppliers_df["supplier_name"].dropna().sort_values().tolist():
        supplier_df = pd.read_sql(
            text(
                """
                SELECT *
                FROM derived.replenishment_sheet
                WHERE supplier_name = :supplier
                """
            ),
            con=engine,
            params={"supplier": supplier_name},
        )
        supplier_df["physical stock"] = ""
        supplier_df["order qty"] = ""
        safe_supplier = "".join(char if char.isalnum() or char in " -_." else "_" for char in supplier_name).strip()
        output_path = SUPPLIER_EXPORT_DIR / f"{safe_supplier}.xlsx"
        supplier_df.to_excel(output_path, index=False)


def export_conversion_sheet(engine: Engine) -> None:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_sql(
        text("SELECT * FROM derived.conversion_attention_sheet"),
        con=engine,
    )
    df["physical stock"] = ""
    df["order qty"] = ""
    df.to_excel(EXPORTS_DIR / "conversion_attention_sheet.xlsx", index=False)


def main() -> None:
    engine = get_engine_from_env()

    # print("Running ingestion...")
    # ingest_sales_itemwise()
    # ingest_sales_billwise()
    # ingest_purchase_itemwise()
    # ingest_purchase_billwise()
    # ingest_supplier_master()
    # ingest_item_combinations()

    print("Rebuilding derived tables...")
    for sql_file in REBUILD_SQL_FILES:
        run_sql_file(engine, sql_file)

    print("Ensuring operational sheets exist...")
    for sql_file in SHEET_SQL_FILES:
        run_sql_file(engine, sql_file)

    print("Exporting supplier sheets...")
    export_supplier_sheets(engine)

    print("Exporting conversion attention sheet...")
    export_conversion_sheet(engine)

    print("Weekly pipeline complete.")


if __name__ == "__main__":
    main()
