from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours (one shift)

    # CORS origins for Next.js dev + local LAN
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://ledgerai.local",
        "http://127.0.0.1:3000",
        "http://192.168.0.149:3000",
    ]

    model_config = {"env_file": ".env", "extra": "allow"}


settings = Settings()
