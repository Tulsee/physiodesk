"""Consistent JSON error responses.

Every error leaves the API in the same shape, so the frontend has one place to
read a message from:

    {"detail": "...", "errors": [...]}   # `errors` only on a 422

An unhandled exception is logged in full server-side and reported to the client
as a plain 500, so a stack trace never reaches the browser.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("physiodesk.errors")


def _readable_location(loc: tuple | list) -> str:
    """Turn ('body', 'work_days', 0) into 'work_days.0'.

    Drops the leading source segment: the caller knows it sent a body.
    """
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        """422 with a readable summary alongside the per-field detail.

        Pydantic's raw list is precise but not presentable; `detail` is the
        sentence to show, `errors` is what a form binds to its fields.
        """
        errors = [
            {
                "field": _readable_location(e.get("loc", ())),
                "message": e.get("msg", "Invalid value."),
                "type": e.get("type", "value_error"),
            }
            for e in exc.errors()
        ]
        first = errors[0] if errors else {"field": "request", "message": "Invalid request."}
        summary = f"{first['field']}: {first['message']}"
        if len(errors) > 1:
            summary += f" (and {len(errors) - 1} more)"

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=jsonable_encoder({"detail": summary, "errors": errors}),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Normalizes every HTTPException, including the ones Starlette raises
        itself (404 on an unknown path, 405 on a wrong method)."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        """A constraint the route did not anticipate.

        The driver message names columns and constraints, so it is logged rather
        than returned.
        """
        logger.warning("IntegrityError on %s %s: %s", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "That change conflicts with existing data. "
                "Check for duplicates or records that depend on this one."
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Something went wrong. Please try again."},
        )
