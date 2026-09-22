"""Dependencies shared across route modules."""

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select, func, select
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


@dataclass(frozen=True)
class Pagination:
    """`page` / `page_size` query params, shared by every list endpoint."""

    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def pagination_params(
    page: Annotated[int, Query(ge=1, description="1-based page number.")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Rows per page.")] = 20,
) -> Pagination:
    return Pagination(page=page, page_size=page_size)


PaginationDep = Annotated[Pagination, Depends(pagination_params)]


def paginate(db: Session, stmt: Select[Any], pg: Pagination) -> tuple[list[Any], int]:
    """Run a SELECT twice: once counted, once windowed.

    The count wraps the *filtered* statement with its ORDER BY stripped, so
    `total` reflects the filters while staying a cheap aggregate.
    """
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.execute(count_stmt).scalar_one()
    rows = db.execute(stmt.offset(pg.offset).limit(pg.page_size)).scalars().all()
    return list(rows), total
