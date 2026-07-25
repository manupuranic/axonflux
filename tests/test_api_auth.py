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


class TestAdminEnforcement:
    def test_staff_cannot_access_admin_route(self, client, staff_headers):
        resp = client.post("/api/pipeline/trigger", headers=staff_headers, json={})
        assert resp.status_code == 403

    def test_admin_can_access_admin_route(self, client, admin_headers):
        # 422 = request body validation failed (not an auth failure) — auth passed
        resp = client.post("/api/pipeline/trigger", headers=admin_headers, json={})
        assert resp.status_code in (200, 202, 422)
