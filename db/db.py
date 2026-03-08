from contextlib import contextmanager
from pathlib import Path

from config.db import SessionLocal, engine


class DB:
    """
    Minimal DB helper for ingestion & pipelines.
    Exposes both ORM sessions and raw connections.
    """

    @contextmanager
    def session(self):
        session = SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @contextmanager
    def connection(self):
        """
        Raw engine-level connection.
        Use for bulk ingestion only.
        """
        with engine.begin() as conn:
            yield conn


def run_sql_file(sql_engine, path: str | Path) -> None:
    """Execute a SQL file from disk in a single transaction."""
    sql_path = Path(path)
    sql_text = sql_path.read_text(encoding="utf-8")

    if not sql_text.strip():
        return

    with sql_engine.begin() as connection:
        connection.exec_driver_sql(sql_text)
