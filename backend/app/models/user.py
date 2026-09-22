"""Staff account used to sign in to the app."""

from enum import Enum

from sqlalchemy import Enum as SAEnum
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class UserRole(str, Enum):
    """The brief only requires a single front-desk role.

    The column exists anyway so adding therapist/admin later is a data change
    rather than a schema migration.
    """

    FRONT_DESK = "front_desk"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    full_name: Mapped[str | None] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="user_role",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        default=UserRole.FRONT_DESK,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<User {self.username}>"
