import io
import shutil
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from api.storage.client import LocalStorageClient, R2StorageClient, get_storage_client


class TestLocalStorageClient:
    def setup_method(self):
        self.tmp = Path("data/uploads/_test_tmp")
        self.client = LocalStorageClient(base_dir=self.tmp, base_url="/static/uploads")

    def teardown_method(self):
        if self.tmp.exists():
            shutil.rmtree(self.tmp)

    def test_upload_creates_file_and_returns_url(self):
        key = f"{uuid.uuid4().hex}/img.png"
        url = self.client.upload(key, b"fake-png-bytes", "image/png")
        assert (self.tmp / key).read_bytes() == b"fake-png-bytes"
        assert url == f"/static/uploads/{key}"

    def test_public_url_no_upload(self):
        url = self.client.public_url("products/foo.jpg")
        assert url == "/static/uploads/products/foo.jpg"

    def test_delete_removes_file(self):
        key = f"{uuid.uuid4().hex}/del.txt"
        self.client.upload(key, b"data")
        assert (self.tmp / key).exists()
        self.client.delete(key)
        assert not (self.tmp / key).exists()

    def test_delete_nonexistent_is_noop(self):
        self.client.delete("does/not/exist.bin")  # must not raise

    def test_upload_creates_nested_subdirs(self):
        key = f"a/b/c/{uuid.uuid4().hex}.bin"
        self.client.upload(key, b"nested")
        assert (self.tmp / key).exists()

    def test_upload_overwrites_existing_file(self):
        key = f"{uuid.uuid4().hex}/file.txt"
        self.client.upload(key, b"v1")
        self.client.upload(key, b"v2")
        assert (self.tmp / key).read_bytes() == b"v2"

    def test_get_storage_client_returns_local_without_env(self, monkeypatch):
        monkeypatch.delenv("STORAGE_ENDPOINT_URL", raising=False)
        c = get_storage_client()
        assert isinstance(c, LocalStorageClient)

    def test_get_storage_client_returns_r2_with_env(self, monkeypatch):
        boto3 = pytest.importorskip("boto3")
        monkeypatch.setenv("STORAGE_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
        monkeypatch.setenv("STORAGE_ACCESS_KEY", "key")
        monkeypatch.setenv("STORAGE_SECRET_KEY", "secret")
        monkeypatch.setenv("STORAGE_BUCKET", "bucket")
        monkeypatch.setenv("STORAGE_PUBLIC_URL", "https://cdn.example.com")
        c = get_storage_client()
        assert isinstance(c, R2StorageClient)


class TestProductImageUploadEndpoint:
    """API-level tests for POST /api/products/{barcode}/image.
    Uses LocalStorageClient (storage client is mocked to avoid R2 calls in CI).
    """

    def _tiny_png(self) -> bytes:
        try:
            from PIL import Image
            buf = io.BytesIO()
            Image.new("RGB", (4, 4), color="blue").save(buf, format="PNG")
            return buf.getvalue()
        except ImportError:
            # Minimal valid 1×1 PNG (hardcoded bytes)
            return (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
                b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
                b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
            )

    def test_upload_returns_image_url(self, client, admin_headers):
        barcode = f"TEST_{uuid.uuid4().hex[:8]}"
        fake_url = f"/static/uploads/products/{barcode}.png"
        mock_storage = MagicMock()
        mock_storage.upload.return_value = fake_url

        with patch("api.routers.products.get_storage_client", return_value=mock_storage):
            r = client.post(
                f"/api/products/{barcode}/image",
                headers=admin_headers,
                files={"file": ("img.png", self._tiny_png(), "image/png")},
            )
        assert r.status_code == 200
        assert r.json()["image_url"] == fake_url
        mock_storage.upload.assert_called_once_with(
            f"products/{barcode}.png", self._tiny_png(), "image/png"
        )

    def test_upload_stores_url_in_db(self, client, admin_headers, admin_token):
        barcode = f"TEST_{uuid.uuid4().hex[:8]}"
        fake_url = f"https://cdn.example.com/products/{barcode}.jpg"
        mock_storage = MagicMock()
        mock_storage.upload.return_value = fake_url

        with patch("api.routers.products.get_storage_client", return_value=mock_storage):
            r = client.post(
                f"/api/products/{barcode}/image",
                headers=admin_headers,
                files={"file": ("img.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 10, "image/jpeg")},
            )
        assert r.status_code == 200

        # Verify image_url persisted — product detail endpoint reads it
        from sqlalchemy import text
        from tests.conftest import test_engine
        with test_engine.connect() as conn:
            row = conn.execute(
                text("SELECT image_url FROM app.products WHERE barcode = :b"),
                {"b": barcode},
            ).fetchone()
        assert row is not None and row[0] == fake_url

    def test_upload_rejects_non_image(self, client, admin_headers):
        with patch("api.routers.products.get_storage_client"):
            r = client.post(
                "/api/products/ANY_BARCODE/image",
                headers=admin_headers,
                files={"file": ("doc.pdf", b"%PDF", "application/pdf")},
            )
        assert r.status_code == 422

    def test_upload_requires_auth(self, client):
        r = client.post(
            "/api/products/ANY_BARCODE/image",
            files={"file": ("img.png", self._tiny_png(), "image/png")},
        )
        assert r.status_code == 401


@pytest.mark.integration
class TestR2StorageClient:
    """Requires real R2 credentials. Run with: pytest -m integration"""

    def test_upload_delete_roundtrip(self):
        import os

        client = R2StorageClient(
            endpoint_url=os.environ["STORAGE_ENDPOINT_URL"],
            access_key=os.environ["STORAGE_ACCESS_KEY"],
            secret_key=os.environ["STORAGE_SECRET_KEY"],
            bucket=os.environ["STORAGE_BUCKET"],
            region=os.environ.get("STORAGE_REGION", "auto"),
            public_url_base=os.environ.get("STORAGE_PUBLIC_URL", ""),
        )
        key = f"test/{uuid.uuid4().hex}.txt"
        url = client.upload(key, b"r2 integration test", "text/plain")
        assert key in url
        client.delete(key)
