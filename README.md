# PhysioDesk

Clinic management system for a physiotherapy practice — patients, therapists,
scheduling, clinical notes, billing and notifications.

**Stack:** Next.js (App Router, TypeScript) · FastAPI (Python 3.11+, Pydantic v2) ·
PostgreSQL · SQLAlchemy 2.x + Alembic · JWT auth · Docker Compose.

> Work in progress. [PLAN.md](PLAN.md) holds the phase-by-phase build plan;
> [WORKLOG.md](WORKLOG.md) records what each phase actually delivered.

---

## Prerequisites

| Tool           | Version              |
| -------------- | -------------------- |
| Python         | 3.11+                |
| Node.js        | 20+                  |
| Docker Compose | v2 (for PostgreSQL)  |

## Setup

**1. Environment**

```bash
cp .env.example .env
```

If port 5432 is already in use on your machine, change `POSTGRES_PORT` and the
port inside `DATABASE_URL` to a free one (e.g. 5433).

**2. Database**

```bash
docker compose up -d db
```

**3. Backend**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows; "source .venv/bin/activate" elsewhere
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

API on <http://localhost:8000> · Swagger UI on <http://localhost:8000/docs> ·
liveness on <http://localhost:8000/health>.

**4. Frontend**

_To be completed (Phase 6)._

## Seeding demo data

_To be completed (Phase 5)._

## Environment variables

See [.env.example](.env.example) for the full annotated list.

## Project structure

_To be completed._

## API documentation

Once the backend is running, Swagger UI is served at `http://localhost:8000/docs`.

## Assumptions & trade-offs

_To be completed._

## What I'd do with more time

_To be completed._
