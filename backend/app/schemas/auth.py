"""Auth request and response payloads."""

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64, examples=["frontdesk"])
    password: str = Field(min_length=1, max_length=128, examples=["physiodesk123"])


class UserRead(BaseModel):
    """A user as returned by the API — never carries the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str | None = None
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token lifetime in seconds.")
    user: UserRead
