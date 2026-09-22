# PhysioDesk — backend

FastAPI + SQLAlchemy 2.x + Alembic on PostgreSQL.

## Run locally

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows; use "source .venv/bin/activate" elsewhere
pip install -r requirements-dev.txt

# from the repo root: docker compose up -d db
alembic upgrade head
uvicorn app.main:app --reload
```

The API is then on <http://localhost:8000>, Swagger UI on
<http://localhost:8000/docs>, liveness on `/health`.

## Layout

```
app/
├── main.py       # app factory + router registration
├── core/         # config, database session, security
├── models/       # SQLAlchemy models
├── schemas/      # Pydantic v2 request/response schemas
├── api/          # dependencies and route modules
└── services/     # domain logic (slot derivation, billing math, notifications)
alembic/          # migrations
tests/            # pytest suite
```
