"""
AssetService abstraction.

Phase 1: LocalAssetService writes to data/uploads/campaign_assets/
and serves via FastAPI static mount at /static/uploads.

Phase C2: swap in StorageClient (S3/R2) by changing ASSET_SERVICE_BACKEND in .env.
Interface contract is identical — callers never touch implementation details.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Protocol


class AssetService(Protocol):
    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        kind: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Store file and return its public URL."""
        ...

    async def delete(self, url: str) -> None:
        """Remove file. Silently ignores missing URLs."""
        ...

    def public_url(self, path: str) -> str:
        """Convert a storage path to a public URL."""
        ...


class LocalAssetService:
    """Stores files under data/uploads/campaign_assets/ and serves at /static/uploads."""

    _SERVE_PREFIX = "/static/uploads"

    def __init__(self, upload_root: Path | None = None, base_url: str = ""):
        if upload_root is None:
            project_root = Path(__file__).parents[3]
            upload_root = project_root / "data" / "uploads"
        self._root = upload_root
        self._base_url = base_url.rstrip("/")

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        kind: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        ext = Path(filename).suffix or ""
        safe_name = f"{uuid.uuid4().hex}{ext}"
        dest_dir = self._root / "campaign_assets" / kind
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / safe_name
        dest.write_bytes(file_bytes)
        rel = f"campaign_assets/{kind}/{safe_name}"
        return f"{self._base_url}{self._SERVE_PREFIX}/{rel}"

    async def delete(self, url: str) -> None:
        if self._SERVE_PREFIX not in url:
            return
        rel = url.split(self._SERVE_PREFIX + "/", 1)[-1]
        path = self._root / rel
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    def public_url(self, path: str) -> str:
        return f"{self._base_url}{self._SERVE_PREFIX}/{path}"


def get_asset_service() -> LocalAssetService:
    """Dependency-injectable factory. Swap implementation here when C2 ships."""
    from api.core.config import settings
    base_url = getattr(settings, "PUBLIC_BASE_URL", "")
    return LocalAssetService(base_url=base_url)
