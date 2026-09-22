"""Dependencies shared across route modules."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import TokenError, decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer(
    auto_error=False, description="JWT issued by POST /auth/login"
)

DbSession = Annotated[Session, Depends(get_db)]

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """Resolve the bearer token to a User, or raise 401.

    Missing, malformed, expired and stale-but-valid tokens all produce the same
    401 so the endpoint reveals nothing about why a token was rejected.
    """
    if credentials is None or not credentials.credentials:
        raise _CREDENTIALS_EXC

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError:
        raise _CREDENTIALS_EXC from None

    username = payload.get("sub")
    if not username:
        raise _CREDENTIALS_EXC

    user = db.execute(
        select(User).where(User.username == username)
    ).scalar_one_or_none()
    if user is None:
        raise _CREDENTIALS_EXC
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled."
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
