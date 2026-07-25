"""
Unit tests for the role lattice guard factory.
Pure unit level — call the guard with a constructed CurrentUser, no HTTP.
"""
import pytest
from fastapi import HTTPException

from api.dependencies import ROLE_LEVELS, require_role
from api.schemas.auth import CurrentUser


def _user(role: str) -> CurrentUser:
    return CurrentUser(id="00000000-0000-0000-0000-000000000001", username="u", role=role)


class TestRoleLevels:
    def test_lattice_order(self):
        assert ROLE_LEVELS["staff"] < ROLE_LEVELS["manager"] < ROLE_LEVELS["admin"]

    def test_exactly_three_roles(self):
        assert set(ROLE_LEVELS) == {"staff", "manager", "admin"}


class TestRequireRole:
    # (caller_role, minimum, allowed)
    MATRIX = [
        ("staff",   "staff",   True),
        ("staff",   "manager", False),
        ("staff",   "admin",   False),
        ("manager", "staff",   True),
        ("manager", "manager", True),
        ("manager", "admin",   False),
        ("admin",   "staff",   True),
        ("admin",   "manager", True),
        ("admin",   "admin",   True),
    ]

    @pytest.mark.parametrize("role,minimum,allowed", MATRIX)
    def test_matrix(self, role, minimum, allowed):
        guard = require_role(minimum)
        if allowed:
            assert guard(current_user=_user(role)).role == role
        else:
            with pytest.raises(HTTPException) as exc:
                guard(current_user=_user(role))
            assert exc.value.status_code == 403

    @pytest.mark.parametrize("garbage", ["", "root", "superadmin", "Staff"])
    def test_unknown_role_rejected_even_at_staff_gate(self, garbage):
        guard = require_role("staff")
        with pytest.raises(HTTPException) as exc:
            guard(current_user=_user(garbage))
        assert exc.value.status_code == 403
