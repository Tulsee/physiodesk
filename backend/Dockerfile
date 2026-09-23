# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Requirements first: this layer is cached until the pins actually change.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Uploads live on a volume; create the mount point so a fresh container works
# even before anything is uploaded.
RUN mkdir -p /app/uploads

EXPOSE 8000

# entrypoint.sh waits for Postgres, applies migrations, then seeds on first run.
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
