from sqlalchemy import insert
from typing import Callable, Dict
from uuid import uuid4
import pandas as pd

from utils.chunking import chunked
from utils.helpers import clean, normalize_column
from db.db import DB


def ingest_raw_table(
    *,
    file_path,
    model,
    header_map: Dict[str, str],
    reader: Callable,
    drop_last_row: bool = False,
    chunk_size: int = 2000,
):
    print(f"[INGEST] {model.__tablename__} → {file_path.name}")

    import_batch_id = uuid4()

    df = reader(file_path)
    df.columns = [normalize_column(c) for c in df.columns]

    if drop_last_row:
        df = df[:-1]

    rows = []
    for _, row in df.iterrows():
        record = {
            "import_batch_id": import_batch_id,
            "source_file_name": file_path.name,
        }

        for csv_col, db_col in header_map.items():
            record[db_col] = clean(row.get(csv_col))

        rows.append(record)

    stmt = insert(model)
    total = len(rows)
    inserted = 0

    db = DB()
    with db.connection() as conn:
        for chunk in chunked(rows, chunk_size):
            conn.execute(stmt, chunk)
            inserted += len(chunk)
            print(f"[INGEST] Inserted {inserted}/{total}")

    print(
        f"[INGEST] Completed {model.__tablename__}: "
        f"{total} rows (batch {import_batch_id})"
    )
    return import_batch_id