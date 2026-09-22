"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    billing,
    clinical_notes,
    dashboard,
    notifications,
    patients,
    reports,
    schedule,
    therapists,
)
from app.core.config import settings
from app.core.errors import register_exception_handlers


def create_app() -> FastAPI:
    """Build the app. A factory (rather than a module-level app) keeps tests free
    to construct an isolated instance."""
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Clinic management API for a physiotherapy practice.",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"], summary="Liveness probe")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(therapists.router)
    app.include_router(patients.router)
    app.include_router(clinical_notes.router)
    app.include_router(reports.router)
    app.include_router(schedule.router)
    app.include_router(billing.router)
    app.include_router(notifications.router)
    app.include_router(dashboard.router)

    register_exception_handlers(app)

    return app


app = create_app()
