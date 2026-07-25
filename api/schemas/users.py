from datetime import datetime

from pydantic import BaseModel, field_validator

from api.dependencies import ROLE_LEVELS


def _validate_role(v: str) -> str:
    if v not in ROLE_LEVELS:
        raise ValueError(f"role must be one of {sorted(ROLE_LEVELS)}")
    return v


class UserOut(BaseModel):
    id: str
    username: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime | None
    last_login_at: datetime | None


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    role: str = "staff"

    @field_validator("role")
    @classmethod
    def role_valid(cls, v):
        return _validate_role(v)

    @field_validator("username")
    @classmethod
    def username_not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("username must not be blank")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class UserPatch(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None

    @field_validator("role")
    @classmethod
    def role_valid(cls, v):
        if v is None:
            return v
        return _validate_role(v)

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v
