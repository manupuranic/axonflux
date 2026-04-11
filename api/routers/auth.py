from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.core.security import verify_password, create_access_token
from api.dependencies import get_db
from api.models.app import AppUser
from api.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AppUser).filter(
        AppUser.username == body.username,
        AppUser.is_active == True,
    ).first()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    user.last_login_at = datetime.now(timezone.utc)

    token = create_access_token(
        subject=user.username,
        role=user.role,
        extra={"user_id": str(user.id), "full_name": user.full_name},
    )
    return TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
    )
