"""Importing this package registers every model on Base.metadata.

alembic/env.py imports it so --autogenerate sees the full schema.
"""

from app.models.user import User, UserRole

__all__ = ["User", "UserRole"]
