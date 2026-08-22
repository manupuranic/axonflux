"""
BOM API tests — confirm, reject, duplicate prevention, qty validation.
All tests use UUID barcodes to avoid cross-test conflicts (no truncate needed between tests).
"""
import uuid

from tests.conftest import BOM_FINISHED_BARCODE, BOM_FINISHED_NAME, BOM_RAW_BARCODE, BOM_RAW_NAME


def _unique_pair():
    """Generate a unique raw/finished barcode pair for a single test."""
    return f"RAW_{uuid.uuid4().hex[:8]}", f"FIN_{uuid.uuid4().hex[:8]}"


class TestBomConfirm:
    def test_confirm_creates_mapping(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        resp = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 10.0,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["raw_barcode"] == raw_bc
        assert body["finished_barcode"] == fin_bc
        assert body["qty_per_unit"] == 10.0

    def test_confirm_resolves_known_names(self, client, staff_headers):
        resp = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": BOM_RAW_BARCODE,
            "finished_barcode": BOM_FINISHED_BARCODE,
            "qty_per_unit": 5.0,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["raw_name"] == BOM_RAW_NAME
        assert body["finished_name"] == BOM_FINISHED_NAME

    def test_confirm_qty_zero_returns_422(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        resp = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 0,
        })
        assert resp.status_code == 422

    def test_confirm_qty_negative_returns_422(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        resp = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": -1.0,
        })
        assert resp.status_code == 422

    def test_confirm_duplicate_returns_409(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        payload = {"raw_barcode": raw_bc, "finished_barcode": fin_bc, "qty_per_unit": 3.0}
        resp1 = client.post("/api/tools/bom/confirm", headers=staff_headers, json=payload)
        assert resp1.status_code == 200
        resp2 = client.post("/api/tools/bom/confirm", headers=staff_headers, json=payload)
        assert resp2.status_code == 409

    def test_confirm_requires_auth(self, client):
        raw_bc, fin_bc = _unique_pair()
        resp = client.post("/api/tools/bom/confirm", json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 1.0,
        })
        assert resp.status_code == 401


class TestBomReject:
    def _seed_suggestion(self, client, staff_headers, raw_bc: str, fin_bc: str) -> str:
        """Insert a pending suggestion via the test DB directly — returns suggestion id."""
        from tests.conftest import test_engine
        from sqlalchemy import text

        with test_engine.begin() as conn:
            row = conn.execute(text("""
                INSERT INTO app.product_bom_suggestions
                    (raw_barcode, raw_name, finished_barcode, finished_name, similarity_score, status)
                VALUES (:r, 'Raw', :f, 'Fin', 90.0, 'pending')
                RETURNING id::TEXT
            """), {"r": raw_bc, "f": fin_bc}).scalar()
        return row

    def test_reject_marks_suggestion_rejected(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        sid = self._seed_suggestion(client, staff_headers, raw_bc, fin_bc)
        resp = client.post("/api/tools/bom/reject", headers=staff_headers, json={"suggestion_id": sid})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_reject_nonexistent_returns_404(self, client, staff_headers):
        resp = client.post("/api/tools/bom/reject", headers=staff_headers, json={
            "suggestion_id": str(uuid.uuid4())
        })
        assert resp.status_code == 404

    def test_reject_already_rejected_returns_404(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        sid = self._seed_suggestion(client, staff_headers, raw_bc, fin_bc)
        client.post("/api/tools/bom/reject", headers=staff_headers, json={"suggestion_id": sid})
        resp = client.post("/api/tools/bom/reject", headers=staff_headers, json={"suggestion_id": sid})
        assert resp.status_code == 404


class TestBomListMappings:
    def test_list_mappings_returns_confirmed_entries(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 7.5,
        })
        resp = client.get("/api/tools/bom/mappings", headers=staff_headers)
        assert resp.status_code == 200
        barcodes = {m["raw_barcode"] for m in resp.json()}
        assert raw_bc in barcodes


class TestBomUpdateMapping:
    def test_update_qty(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        created = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 0.25,
        })
        assert created.status_code == 200
        mapping_id = created.json()["id"]

        resp = client.patch(
            f"/api/tools/bom/mappings/{mapping_id}",
            headers=staff_headers,
            json={"qty_per_unit": 0.5},
        )
        assert resp.status_code == 200
        assert resp.json()["qty_per_unit"] == 0.5

    def test_update_missing_returns_404(self, client, staff_headers):
        resp = client.patch(
            f"/api/tools/bom/mappings/{uuid.uuid4()}",
            headers=staff_headers,
            json={"qty_per_unit": 1.0},
        )
        assert resp.status_code == 404


class TestBomDeleteMapping:
    def test_delete_mapping(self, client, staff_headers):
        raw_bc, fin_bc = _unique_pair()
        created = client.post("/api/tools/bom/confirm", headers=staff_headers, json={
            "raw_barcode": raw_bc,
            "finished_barcode": fin_bc,
            "qty_per_unit": 0.05,
        })
        assert created.status_code == 200
        mapping_id = created.json()["id"]

        resp = client.delete(f"/api/tools/bom/mappings/{mapping_id}", headers=staff_headers)
        assert resp.status_code == 204

        listed = client.get("/api/tools/bom/mappings", headers=staff_headers)
        assert mapping_id not in {m["id"] for m in listed.json()}

    def test_delete_missing_returns_404(self, client, staff_headers):
        resp = client.delete(f"/api/tools/bom/mappings/{uuid.uuid4()}", headers=staff_headers)
        assert resp.status_code == 404
