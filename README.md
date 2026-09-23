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

In a second terminal, from `frontend/`:

```bash
npm install
cp .env.example .env.local      # points at http://localhost:8000
npm run dev
```

Open <http://localhost:3000> and sign in with the seeded credentials.

## Seeding demo data

From `backend/`, with the database running and migrations applied:

```bash
python -m app.seed            # seed an empty database
python -m app.seed --reset    # wipe the domain tables and seed again
```

Then sign in with the credentials from your `.env`
(`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`, default `frontdesk` /
`physiodesk123`).

The script is idempotent — running it on a populated database does nothing
unless you pass `--reset` — and deterministic, so every machine gets the same
demo data. Dates are generated relative to today, so the dashboard and schedule
always have current activity.

What it creates:

| Data | Coverage |
| ---- | -------- |
| 4 therapists    | Different work days, hours and slot lengths (30/45/60 min), including one who works Saturdays |
| 3 overrides     | A day off, a late start, and an extra clinic added to a normal day off |
| 15 patients     | Active, on-hold and discharged, each assigned to a plausible specialist |
| 52 appointments | Past, today and the next fortnight; scheduled, completed, cancelled and no-show |
| 89 notes        | Multi-session histories whose pain/ROM/strength scores trend, so the charts show a curve |
| 35 invoices     | All four statuses (due, partial, paid, refunded), some discounted, with payment histories |
| 10 notifications| Every type, channel and status, including a failure with its reason |

Appointments are placed on real derived slots via the scheduling service, so no
seeded row could break the rules the API itself enforces.

## Environment variables

See [.env.example](.env.example) for the full annotated list.

## Project structure

```
backend/          FastAPI + SQLAlchemy + Alembic
  app/core/       config, database session, security, error handlers
  app/models/     SQLAlchemy models
  app/schemas/    Pydantic request/response schemas
  app/api/        dependencies and route modules
  app/services/   slot derivation, billing math, storage, notifications
  app/seed.py     demo data
frontend/         Next.js App Router + TypeScript + Tailwind v4
  src/app/        routes: (auth) for login, (app) behind the auth guard
  src/components/ shell (sidebar, top bar) and shared UI primitives
  src/lib/        api client, auth context, formatting, domain types
```

## API documentation

Once the backend is running, Swagger UI is served at `http://localhost:8000/docs`.

## Assumptions & trade-offs

_To be completed._

## What I'd do with more time

_To be completed._
