"""Login and current-user endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Exchange credentials for a JWT",
    responses={401: {"description": "Incorrect username or password."}},
)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.execute(
        select(User).where(User.username == payload.username)
    ).scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled."
        )

    return TokenResponse(
        access_token=create_access_token(subject=user.username),
        expires_in=settings.jwt_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserRead,
    summary="The signed-in user",
    responses={401: {"description": "Missing or invalid token."}},
)
def read_me(current_user: CurrentUser) -> UserRead:
    """Lets the frontend validate a stored token on page load."""
    return UserRead.model_validate(current_user)
