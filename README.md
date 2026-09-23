# PhysioDesk

Clinic management system for a physiotherapy practice — patients, therapists,
scheduling, clinical notes, billing and notifications.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · FastAPI (Python 3.12,
Pydantic v2) · PostgreSQL 16 · SQLAlchemy 2.x + Alembic · JWT auth · Docker Compose.

[PLAN.md](PLAN.md) is the build plan; [WORKLOG.md](WORKLOG.md) records what each
phase delivered, the decisions behind it, and the bugs found along the way.

---

## Quick start — one command

With Docker running:

```bash
cp .env.example .env
docker compose up --build
```

That builds all three images, waits for PostgreSQL, applies the migrations and
seeds demo data. Roughly 3–4 minutes on a cold build, ~15 seconds afterwards.

| | |
| --- | --- |
| App | <http://localhost:3000> |
| API | <http://localhost:8000> |
| API docs (Swagger UI) | <http://localhost:8000/docs> |
| Sign in | `frontdesk` / `physiodesk123` |

Stop with `docker compose down`, or `docker compose down -v` to discard the
database and uploaded files too.

> If port 5432, 8000 or 3000 is already taken, set `POSTGRES_PORT`, `API_PORT`
> or `WEB_PORT` in `.env`.

---

## Running it locally, without Docker

Useful for development — hot reload on both sides. You still need the database
container (or any PostgreSQL 16).

**1. Environment**

```bash
cp .env.example .env
docker compose up -d db
```

**2. Backend** — from `backend/`:

```bash
python -m venv .venv
.venv/Scripts/activate            # Windows; "source .venv/bin/activate" elsewhere
pip install -r requirements-dev.txt

alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

**3. Frontend** — from `frontend/`, in a second terminal:

```bash
npm install
cp .env.example .env.local
npm run dev
```

---

## Seeding demo data

From `backend/`:

```bash
python -m app.seed            # seed an empty database
python -m app.seed --reset    # wipe the domain tables and seed again
```

Idempotent (running it twice changes nothing without `--reset`) and
deterministic, so every machine gets identical data. Dates are generated
relative to today, so the dashboard and schedule always show current activity.

| Data | Rows | Coverage |
| ---- | ---- | -------- |
| Therapists | 4 | Different work days, hours and slot lengths (30/45/60 min); one works Saturdays, one afternoons only |
| Schedule overrides | 3 | A day off, a late start, and an extra clinic added to a normal day off |
| Patients | 15 | Active, on-hold and discharged |
| Appointments | 52 | Past four weeks, today, and the next fortnight; all four statuses |
| Clinical notes | 89 | Multi-session histories with trending scores and milestones |
| Invoices | 35 | All four statuses, some discounted, each with a payment ledger |
| Notifications | 10 | Every type, channel and status, including a failure with its reason |

Appointments are placed through the real slot engine, so no seeded row could
break a rule the API enforces.

---

## Tests

**Backend** — 130 tests, from `backend/`:

```bash
pytest
```

Runs against a separate `physiodesk_test` database, created automatically. Each
test runs inside a transaction that is rolled back, so development data is never
touched. Covers auth and token handling, the slot derivation engine, billing
arithmetic, delete guards, booking conflicts, and server-side filtering and
pagination.

**Frontend** — 25 end-to-end tests, from `frontend/`:

```bash
npm run test:e2e         # needs the stack running
npm run test:e2e:ui      # interactive
```

Drives a real browser through sign-in, search and filtering, the tabbed patient
profile, progress charts, booking, payments and refunds, the receipt, and the
therapist delete guard. Uses Microsoft Edge via `channel: "msedge"` to avoid a
browser download — run `npx playwright install chromium` and edit
`playwright.config.ts` if you would rather use bundled Chromium.

---

## Project structure

```
backend/
  app/core/        config, database session, security, error handlers
  app/models/      SQLAlchemy models
  app/schemas/     Pydantic request/response schemas
  app/api/routes/  one module per feature area
  app/services/    slot derivation, billing math, storage, notifications
  app/seed.py      demo data
  alembic/         migrations
  tests/           pytest suite
frontend/
  src/app/         routes — (auth) for login, (app) behind the auth guard
  src/components/  shell, shared UI primitives, per-module components
  src/lib/         api client, auth context, formatting, domain types
  e2e/             Playwright tests
```

---

## Architecture notes

Three things are **derived, never stored**. This is the core design decision and
it shows up throughout.

**Schedule slots.** There is no `slots` table. For a given therapist and date the
engine reads a per-date override, falls back to the default working pattern, and
generates fixed-length slots, marking as booked any slot an appointment overlaps.
One function in `services/scheduling.py` powers the schedule grid, the dashboard
capacity strip and the therapist profile's week view, so they cannot disagree.

Overlap uses half-open intervals, so 09:00–09:45 and 09:45–10:30 do not collide,
while an appointment longer than one slot correctly blocks every slot it covers.
A cancelled appointment frees its slot; a no-show does not, because the time was
used either way.

**Progress charts.** The pain, range-of-motion and strength series are a
projection of `clinical_notes` — the same rows read a different way. There is no
separate progress table to drift out of sync, and deleting a note removes its
point from the chart.

**Invoice status and balance.** `status` and `paid_amount` are a denormalized
cache of the payment rows, recomputed inside the same transaction as every
payment write. Reads stay a single row lookup; the cache cannot be written
without its payment. A refund is a negative `payment.amount` rather than a
separate table, so the ledger is append-only and the balance is just a sum.

---

## Environment variables

See [.env.example](.env.example) for the annotated list.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `physiodesk` | Database credentials |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL |
| `API_PORT` / `WEB_PORT` | `8000` / `3000` | Host ports for the API and app |
| `DATABASE_URL` | localhost | SQLAlchemy URL (compose overrides this to reach `db`) |
| `JWT_SECRET` | `change-me-in-production` | Token signing key — **replace for any real deployment** |
| `JWT_EXPIRE_MINUTES` | `480` | Token lifetime |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | `uploads` / `10` | Where report files go, and the size cap |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | `frontdesk` / `physiodesk123` | Account the seed script creates |
| `SEED_ON_START` | `true` | Set `false` to start the container with an empty database |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL, **inlined at build time** |

---

## Assumptions & trade-offs

**Product**

- **One `front_desk` role.** The brief allows it. `users.role` exists as a
  column, so adding therapist or admin roles is a data change, not a migration.
- **Clinical note scales.** Pain 0–10 (numeric rating scale), ROM 0–100 (% of
  normal), strength 0–5 (manual muscle test). These are clinically conventional
  but were inferred — if the brief specifies different scales, the bounds live in
  one place on each side.
- **Notification delivery is simulated.** `NotificationSender` is a Protocol with
  a `ConsoleSender` implementation that logs instead of sending. It still checks
  that a usable address exists for the channel, so the simulation exercises the
  real failure path. There is no scheduler: sending is triggered explicitly.
- **Currency is displayed as `Rs`** with no multi-currency support.

**Technical**

- **Money is `Numeric(10,2)` end to end,** and reaches the browser as a string.
  Parsing it into a JavaScript float would reintroduce exactly the rounding
  errors the backend avoids, so the frontend only converts for comparisons.
- **Dates and times are stored separately** on appointments rather than as one
  timestamp. Slots are derived per-day and the grid renders a local wall-clock
  time; a single `timestamptz` would drag timezone conversion into every query.
  The clinic is assumed to operate in one timezone.
- **`ondelete` differs per relationship.** `patients.therapist_id` is SET NULL so
  losing a therapist can never delete patients; appointments RESTRICT; a
  patient's own records CASCADE.
- **Enums are VARCHAR + CHECK, not native PostgreSQL enums,** so adding a value
  later is an ordinary migration rather than an `ALTER TYPE`.
- **Uploads go to a local directory** with the path in the database, behind a
  small storage helper. Swapping to S3 means reimplementing three functions.
- **PyJWT over python-jose** (unmaintained, has CVEs) and **bcrypt directly over
  passlib** (stale, breaks against bcrypt 4.x). PLAN.md named the alternatives.
- **No data-fetching library.** A ~100-line `useQuery` hook covers what this app
  needs; React Query would be the right call once caching or optimistic updates
  are wanted.
- **Progress uses three small-multiple charts, not one dual-axis chart.** Pain,
  ROM and strength are different scales; a shared axis would let a crossing read
  as meaningful when it is an artefact of scaling. Chart colours were validated
  for colour-vision deficiency and contrast rather than chosen by eye.
- **Light mode only.** A half-applied theme is worse than none.

---

## What I'd do with more time

- **A real notification scheduler** (APScheduler or a Celery beat worker) so
  reminders send themselves at `scheduled_for` instead of on demand.
- **Optimistic updates and cache invalidation** via React Query, replacing the
  manual `refetch()` calls after every write.
- **Focus trapping in dialogs.** They close on Escape and on a backdrop click,
  but focus is not trapped — the main accessibility gap.
- **A global error boundary.** Per-view error states cover every fetch, but a
  render-time exception still falls through to Next's default error page.
- **Audit trail.** Who changed what and when, which a clinic handling money and
  clinical records would want.
- **Rate limiting on `/auth/login`,** and refresh tokens so sessions can be
  revoked before expiry.
- **Cursor pagination** for the lists that will grow without bound (appointments,
  payments); offset pagination degrades on deep pages.
- **CI** running `pytest`, `tsc`, `eslint` and the Playwright suite against the
  compose stack on every push.
