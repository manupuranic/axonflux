"""
User management API — admin-only CRUD.
"""
import uuid

from tests.conftest import ADMIN_USERNAME, TEST_PASSWORD


def _uname():
    return f"apitest_{uuid.uuid4().hex[:12]}"


def _create(client, admin_headers, role="staff", password=TEST_PASSWORD):
    username = _uname()
    resp = client.post("/api/users", headers=admin_headers, json={
        "username": username, "password": password,
        "full_name": "Api Test", "role": role,
    })
    return resp, username


class TestAccessControl:
    def test_staff_403_on_all_user_endpoints(self, client, staff_headers):
        assert client.get("/api/users", headers=staff_headers).status_code == 403
        assert client.post("/api/users", headers=staff_headers, json={}).status_code == 403
        assert client.patch(f"/api/users/{uuid.uuid4()}", headers=staff_headers, json={}).status_code == 403

    def test_manager_403_on_all_user_endpoints(self, client, manager_headers):
        assert client.get("/api/users", headers=manager_headers).status_code == 403
        assert client.post("/api/users", headers=manager_headers, json={}).status_code == 403
        assert client.patch(f"/api/users/{uuid.uuid4()}", headers=manager_headers, json={}).status_code == 403


class TestCrud:
    def test_admin_lists_users(self, client, admin_headers):
        resp = client.get("/api/users", headers=admin_headers)
        assert resp.status_code == 200
        usernames = [u["username"] for u in resp.json()]
        assert ADMIN_USERNAME in usernames
        assert "hashed_password" not in resp.json()[0]

    def test_admin_creates_manager_who_can_login(self, client, admin_headers):
        resp, username = _create(client, admin_headers, role="manager")
        assert resp.status_code == 201
        assert resp.json()["role"] == "manager"
        login = client.post("/api/auth/login", json={"username": username, "password": TEST_PASSWORD})
        assert login.status_code == 200
        assert login.json()["role"] == "manager"

    def test_duplicate_username_409(self, client, admin_headers):
        _, username = _create(client, admin_headers)
        resp = client.post("/api/users", headers=admin_headers, json={
            "username": username, "password": TEST_PASSWORD, "full_name": None, "role": "staff",
        })
        assert resp.status_code == 409

    def test_invalid_role_422(self, client, admin_headers):
        resp = client.post("/api/users", headers=admin_headers, json={
            "username": _uname(), "password": TEST_PASSWORD, "full_name": None, "role": "agent",
        })
        assert resp.status_code == 422

    def test_admin_changes_role(self, client, admin_headers):
        resp, _ = _create(client, admin_headers, role="staff")
        uid = resp.json()["id"]
        patch = client.patch(f"/api/users/{uid}", headers=admin_headers, json={"role": "manager"})
        assert patch.status_code == 200
        assert patch.json()["role"] == "manager"

    def test_deactivated_user_cannot_login(self, client, admin_headers):
        resp, username = _create(client, admin_headers)
        uid = resp.json()["id"]
        client.patch(f"/api/users/{uid}", headers=admin_headers, json={"is_active": False})
        login = client.post("/api/auth/login", json={"username": username, "password": TEST_PASSWORD})
        assert login.status_code == 401

    def test_password_reset(self, client, admin_headers):
        resp, username = _create(client, admin_headers)
        uid = resp.json()["id"]
        client.patch(f"/api/users/{uid}", headers=admin_headers, json={"password": "newpass456"})
        assert client.post("/api/auth/login", json={"username": username, "password": "newpass456"}).status_code == 200
        assert client.post("/api/auth/login", json={"username": username, "password": TEST_PASSWORD}).status_code == 401

    def test_unknown_user_404(self, client, admin_headers):
        resp = client.patch(f"/api/users/{uuid.uuid4()}", headers=admin_headers, json={"role": "staff"})
        assert resp.status_code == 404

    def test_non_uuid_user_id_404(self, client, admin_headers):
        resp = client.patch("/api/users/not-a-uuid", headers=admin_headers, json={"role": "staff"})
        assert resp.status_code == 404

    def test_duplicate_username_race_hits_db_constraint(self, client, admin_headers, monkeypatch):
        """Simulate the check-then-insert race: blind the pre-check so the INSERT
        reaches the DB unique constraint, which must still surface as 409."""
        import api.routers.users as users_module

        _, username = _create(client, admin_headers)
        monkeypatch.setattr(users_module, "_username_taken", lambda db, u: False)
        resp = client.post("/api/users", headers=admin_headers, json={
            "username": username, "password": TEST_PASSWORD, "full_name": None, "role": "staff",
        })
        assert resp.status_code == 409


class TestSafetyRails:
    def _admin_id(self, client, admin_headers):
        users = client.get("/api/users", headers=admin_headers).json()
        return next(u["id"] for u in users if u["username"] == ADMIN_USERNAME)

    def test_admin_cannot_demote_self(self, client, admin_headers):
        uid = self._admin_id(client, admin_headers)
        resp = client.patch(f"/api/users/{uid}", headers=admin_headers, json={"role": "staff"})
        assert resp.status_code == 400

    def test_admin_cannot_deactivate_self(self, client, admin_headers):
        uid = self._admin_id(client, admin_headers)
        resp = client.patch(f"/api/users/{uid}", headers=admin_headers, json={"is_active": False})
        assert resp.status_code == 400

    def test_admin_can_rename_self(self, client, admin_headers):
        uid = self._admin_id(client, admin_headers)
        resp = client.patch(f"/api/users/{uid}", headers=admin_headers, json={"full_name": "Test Admin"})
        assert resp.status_code == 200
