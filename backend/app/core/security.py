"""Password hashing and JWT encode/decode.

bcrypt is called directly rather than through passlib: passlib 1.7.4 predates
bcrypt 4.x and errors on its version probe, and the wrapper buys us nothing here.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72


class TokenError(Exception):
    """Raised when a token is malformed, expired, or signed with the wrong key."""


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    if len(pw) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:MAX_PASSWORD_BYTES], hashed.encode("utf-8")
        )
    except ValueError:
        return False


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    """Issue a signed JWT whose `sub` is the username."""
    minutes = (
        expires_minutes if expires_minutes is not None else settings.jwt_expire_minutes
    )
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify and decode a token, or raise TokenError.

    Translating PyJWT's exception tree into one error type keeps the callers
    from importing jwt just to catch things.
    """
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
