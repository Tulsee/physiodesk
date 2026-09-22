"""Base classes shared by every schema module."""

import math

from pydantic import BaseModel, ConfigDict, Field

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


class Page[T](BaseModel):
    """Envelope returned by every list endpoint.

    One shape across all modules means the frontend writes the pagination
    control once.
    """

    items: list[T]
    total: int = Field(
        description="Total rows matching the filters, ignoring pagination."
    )
    page: int
    page_size: int
    pages: int = Field(description="Total number of pages, at least 1.")

    @classmethod
    def build(cls, items: list[T], total: int, page: int, page_size: int) -> "Page[T]":
        pages = max(1, math.ceil(total / page_size)) if page_size else 1
        return cls(
            items=items, total=total, page=page, page_size=page_size, pages=pages
        )
