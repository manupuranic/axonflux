from contextlib import contextmanager
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
