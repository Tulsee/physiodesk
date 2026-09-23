#!/bin/sh
# Bring the container up in a usable state: wait for the database, apply
# migrations, and seed demo data the first time only.
set -e

echo "Waiting for the database..."
until python -c "
import sys
from sqlalchemy import create_engine
from app.core.config import settings
try:
    create_engine(settings.database_url).connect().close()
except Exception:
    sys.exit(1)
" 2>/dev/null; do
  sleep 1
done
echo "Database is up."

echo "Applying migrations..."
alembic upgrade head

# Idempotent: prints a message and exits 0 if data already exists.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding demo data..."
  python -m app.seed
fi

exec "$@"
