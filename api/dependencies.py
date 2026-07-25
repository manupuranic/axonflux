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
        # No fallback role: a token without the claim gets level 0 and fails
        # every guard. Legitimate tokens always carry it (see routers/auth.py).
        role=payload.get("role", ""),
        full_name=payload.get("full_name"),
    )


ROLE_LEVELS = {"staff": 1, "manager": 2, "admin": 3}


def assert_min_role(role: str, minimum: str) -> None:
    """Raise 403 unless `role` meets or exceeds `minimum` on the ROLE_LEVELS lattice.

    Shared by the require_role guard factory below AND the query-token auth
    helpers in api/agents/router.py (_token_auth) and
    api/tools/pamphlets/router.py (_user_from_query_token). Those two exist
    because EventSource/browser navigation can't send Authorization headers,
    so they decode the JWT from a ?token= query param instead of going
    through get_current_user — but they must enforce the exact same
    role-level check, not their own weaker copy.
    """
    if ROLE_LEVELS.get(role, 0) < ROLE_LEVELS[minimum]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{minimum} access required",
        )


def require_role(minimum: str):
    """Guard factory: require_role('manager') passes manager and admin."""
    if minimum not in ROLE_LEVELS:
        raise ValueError(f"Unknown role: {minimum}")

    def guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        assert_min_role(current_user.role, minimum)
        return current_user

    return guard


require_staff = require_role("staff")
require_manager = require_role("manager")
require_admin = require_role("admin")
