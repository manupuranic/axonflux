from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.core.security import decode_access_token
from api.schemas.auth import CurrentUser
from config.db import engine, SessionLocal

_bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Database dependencies
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """ORM session for app.* table reads/writes."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_conn() -> Generator[Connection, None, None]:
    """Raw engine connection for derived.* and raw.* read-only queries."""
    with engine.connect() as conn:
        yield conn


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    payload = decode_access_token(credentials.credentials)
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return CurrentUser(
        id=payload.get("user_id", ""),
        username=username,
        role=payload.get("role", "staff"),
        full_name=payload.get("full_name"),
    )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
