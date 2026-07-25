import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.core.security import hash_password
from api.dependencies import get_db, require_admin
from api.models.app import AppUser
from api.schemas.auth import CurrentUser
from api.schemas.users import UserCreate, UserOut, UserPatch

router = APIRouter(prefix="/api/users", tags=["users"])


def _username_taken(db: Session, username: str) -> bool:
    """Fast-path duplicate check; the DB unique constraint is the real gate."""
    return db.query(AppUser).filter(AppUser.username == username).first() is not None


def _to_out(u: AppUser) -> UserOut:
    return UserOut(
        id=str(u.id),
        username=u.username,
        full_name=u.full_name,
        role=u.role,
        is_active=bool(u.is_active),
        created_at=u.created_at,
        last_login_at=u.last_login_at,
    )


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    users = db.query(AppUser).order_by(AppUser.username).all()
    return [_to_out(u) for u in users]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    if _username_taken(db, body.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = AppUser(
        username=body.username,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        # Concurrent create raced past the pre-check; the DB unique constraint wins
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    return _to_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def patch_user(
    user_id: str,
    body: UserPatch,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user = db.query(AppUser).filter(AppUser.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_self = str(user.id) == current_user.id
    if is_self and body.role is not None and body.role != user.role:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    if is_self and body.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate yourself")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    db.flush()
    return _to_out(user)
