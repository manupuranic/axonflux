from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str | None = None


class CurrentUser(BaseModel):
    id: str
    username: str
    role: str
    full_name: str | None = None
