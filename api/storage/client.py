import os
from abc import ABC, abstractmethod
from pathlib import Path


class StorageClient(ABC):
    @abstractmethod
    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload bytes, return public URL."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete object by key. No-op if key does not exist."""

    @abstractmethod
    def public_url(self, key: str) -> str:
        """Return public URL for key without uploading."""


class LocalStorageClient(StorageClient):
    """Dev-only: writes to data/uploads/, served via FastAPI StaticFiles at /static/uploads."""

    def __init__(
        self,
        base_dir: Path | None = None,
        base_url: str = "/static/uploads",
    ) -> None:
        self.base_dir = base_dir or (Path(__file__).parents[2] / "data" / "uploads")
        self.base_url = base_url.rstrip("/")
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        dest = self.base_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return self.public_url(key)

    def delete(self, key: str) -> None:
        path = self.base_dir / key
        if path.exists():
            path.unlink()

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


class R2StorageClient(StorageClient):
    """Cloudflare R2 via S3-compatible API (boto3). Switching to any S3-compatible
    provider = change STORAGE_* env vars only, zero code changes."""

    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "auto",
        public_url_base: str = "",
    ) -> None:
        import boto3

        self._bucket = bucket
        self._public_url_base = public_url_base.rstrip("/")
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self.public_url(key)

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def public_url(self, key: str) -> str:
        return f"{self._public_url_base}/{key}"


def get_storage_client() -> StorageClient:
    """Factory — reads STORAGE_* env vars, returns appropriate client.

    Local dev (no STORAGE_ENDPOINT_URL set): LocalStorageClient → data/uploads/
    Production (STORAGE_ENDPOINT_URL set): R2StorageClient → Cloudflare R2
    """
    endpoint = os.getenv("STORAGE_ENDPOINT_URL")
    if not endpoint:
        return LocalStorageClient()
    return R2StorageClient(
        endpoint_url=endpoint,
        access_key=os.getenv("STORAGE_ACCESS_KEY", ""),
        secret_key=os.getenv("STORAGE_SECRET_KEY", ""),
        bucket=os.getenv("STORAGE_BUCKET", ""),
        region=os.getenv("STORAGE_REGION", "auto"),
        public_url_base=os.getenv("STORAGE_PUBLIC_URL", ""),
    )
