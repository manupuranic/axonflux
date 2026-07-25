"""
Auth endpoint tests — login, token structure, role enforcement.
Covers: staff/admin roles; invalid creds; protected route without token.
"""
from tests.conftest import ADMIN_USERNAME, MANAGER_USERNAME, STAFF_USERNAME, TEST_PASSWORD


class TestLogin:
    def test_staff_login_returns_token(self, client):
        resp = client.post("/api/auth/login", json={"username": STAFF_USERNAME, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["role"] == "staff"

    def test_admin_login_returns_token(self, client):
        resp = client.post("/api/auth/login", json={"username": ADMIN_USERNAME, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        body = resp.json()
        assert body["role"] == "admin"

    def test_manager_login_returns_token(self, client):
        resp = client.post("/api/auth/login", json={"username": MANAGER_USERNAME, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        assert resp.json()["role"] == "manager"

    def test_wrong_password_returns_401(self, client):
        resp = client.post("/api/auth/login", json={"username": STAFF_USERNAME, "password": "wrong"})
        assert resp.status_code == 401

    def test_unknown_user_returns_401(self, client):
        resp = client.post("/api/auth/login", json={"username": "ghost", "password": TEST_PASSWORD})
        assert resp.status_code == 401

    def test_token_contains_role_and_username(self, client):
        from api.core.security import decode_access_token

        resp = client.post("/api/auth/login", json={"username": STAFF_USERNAME, "password": TEST_PASSWORD})
        token = resp.json()["access_token"]
        payload = decode_access_token(token)
        assert payload["sub"] == STAFF_USERNAME
        assert payload["role"] == "staff"
        assert "user_id" in payload
        assert "exp" in payload


class TestProtectedRoutes:
    def test_no_token_returns_401(self, client):
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get("/api/analytics/summary", headers={"Authorization": "Bearer bad.token.here"})
        assert resp.status_code == 401

    def test_staff_can_access_analytics(self, client, staff_headers):
        resp = client.get("/api/analytics/summary", headers=staff_headers)
        assert resp.status_code == 200

    def test_admin_can_access_analytics(self, client, admin_headers):
        resp = client.get("/api/analytics/summary", headers=admin_headers)
        assert resp.status_code == 200


class TestRoleEnforcementMatrix:
    """Live-endpoint matrix. 403 = gate works; non-403 = gate passed
    (2xx/404/409/422 depending on body/state — auth is what's under test)."""

    # -- pipeline trigger: manager+ ------------------------------------
    def test_pipeline_trigger_staff_403(self, client, staff_headers):
        assert client.post("/api/pipeline/trigger", headers=staff_headers).status_code == 403

    def test_pipeline_trigger_manager_passes(self, client, manager_headers, monkeypatch):
        # TestClient runs BackgroundTasks synchronously — neuter the runner
        # or this test would execute the real pipeline subprocess.
        import api.routers.pipeline as pl
        monkeypatch.setattr(pl, "_run_pipeline", lambda *a, **k: None)
        resp = client.post("/api/pipeline/trigger?run_ingestion=false", headers=manager_headers)
        assert resp.status_code == 202

    # -- pipeline reads: staff+ ----------------------------------------
    def test_pipeline_status_staff_passes(self, client, staff_headers):
        assert client.get("/api/pipeline/status", headers=staff_headers).status_code == 200

    def test_pipeline_last_data_date_staff_passes(self, client, staff_headers):
        assert client.get("/api/pipeline/last-data-date", headers=staff_headers).status_code == 200

    # -- cash closure verify: manager+ ---------------------------------
    def test_cash_verify_staff_403(self, client, staff_headers):
        resp = client.patch(
            "/api/tools/cash-closure/00000000-0000-0000-0000-000000000000/verify",
            headers=staff_headers, json={"status": "verified", "notes": None},
        )
        assert resp.status_code == 403

    def test_cash_verify_manager_passes_gate(self, client, manager_headers):
        resp = client.patch(
            "/api/tools/cash-closure/00000000-0000-0000-0000-000000000000/verify",
            headers=manager_headers, json={"status": "verified", "notes": None},
        )
        assert resp.status_code == 404  # gate passed, record doesn't exist

    # -- entity resolution confirm/reject: manager+ --------------------
    def test_entity_confirm_staff_403(self, client, staff_headers):
        resp = client.post("/api/tools/entity-resolution/confirm", headers=staff_headers, json={})
        assert resp.status_code == 403

    def test_entity_reject_staff_403(self, client, staff_headers):
        resp = client.post("/api/tools/entity-resolution/reject", headers=staff_headers, json={})
        assert resp.status_code == 403

    def test_entity_confirm_manager_passes_gate(self, client, manager_headers):
        resp = client.post("/api/tools/entity-resolution/confirm", headers=manager_headers, json={})
        assert resp.status_code == 422  # gate passed, empty body fails validation

    # -- entity resolution admin ops stay admin ------------------------
    def test_entity_recompute_manager_403(self, client, manager_headers):
        assert client.post("/api/tools/entity-resolution/recompute", headers=manager_headers).status_code == 403

    # -- BOM confirm: staff+ -------------------------------------------
    def test_bom_confirm_staff_passes_gate(self, client, staff_headers):
        resp = client.post("/api/tools/bom/confirm", headers=staff_headers, json={})
        assert resp.status_code == 422  # gate passed, empty body fails validation

    # -- forged token without role claim: 403 everywhere ---------------
    def test_token_missing_role_claim_403(self, client):
        from jose import jwt
        from datetime import datetime, timedelta, timezone
        from api.core.config import settings

        token = jwt.encode(
            {"sub": "test_staff", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            settings.SECRET_KEY, algorithm=settings.ALGORITHM,
        )
        resp = client.get("/api/pipeline/status", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    # -- garbage role: 403 on ordinary staff-gated business routes ------
    def test_garbage_role_token_403_on_business_routes(self, client):
        """A token with an unknown role must be rejected by staff-gated routes."""
        from api.core.security import create_access_token

        token = create_access_token(subject="test_staff", role="ghostrole",
                                    extra={"user_id": "00000000-0000-0000-0000-000000000001"})
        headers = {"Authorization": f"Bearer {token}"}
        for url in ["/api/analytics/summary", "/api/customers", "/api/tools/bom/suggestions"]:
            resp = client.get(url, headers=headers)
            assert resp.status_code == 403, f"{url} returned {resp.status_code}"
