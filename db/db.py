from contextlib import contextmanager
from config.db import SessionLocal

class DB:
    """
    Minimal DB helper for ingestion & pipelines.
    One session per operation. No shared state.
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
