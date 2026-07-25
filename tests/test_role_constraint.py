"""
app.users.role CHECK constraint — invalid roles must be rejected at the DB.
Runs against axonflux_test (constraint must be applied there too).
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import test_engine


def _insert_user(conn, role: str):
    conn.execute(text("""
        INSERT INTO app.users (username, hashed_password, role, is_active)
        VALUES (:u, 'x', :r, TRUE)
    """), {"u": f"constraint_test_{uuid.uuid4().hex[:12]}", "r": role})


@pytest.mark.parametrize("role", ["staff", "manager", "admin"])
def test_valid_roles_accepted(role):
    with test_engine.begin() as conn:
        _insert_user(conn, role)  # no raise


@pytest.mark.parametrize("role", ["root", "", "Manager", "agent"])
def test_invalid_roles_rejected(role):
    with pytest.raises(IntegrityError):
        with test_engine.begin() as conn:
            _insert_user(conn, role)
