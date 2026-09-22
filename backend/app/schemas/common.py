"""Base classes shared by every schema module."""

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Read schema base: builds from SQLAlchemy instances."""

    model_config = ConfigDict(from_attributes=True)


class InputModel(BaseModel):
    """Write schema base.

    - ``str_strip_whitespace`` means "  Anil  " never reaches the database.
    - ``extra="forbid"`` turns a typo'd field into a 422 instead of a silently
      ignored update.
    """

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
