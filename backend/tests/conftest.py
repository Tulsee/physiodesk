"""Test fixtures.

Tests run against a dedicated `..._test` database so a test run can never touch
development or demo data. The schema is created once per session; each test then
runs inside a transaction that is rolled back afterwards, so tests are isolated
without the cost of recreating tables between them.
"""

import datetime as dt
from collections.abc import Generator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import create_app
from app.models import Invoice, Patient, Therapist, User


def _test_database_url() -> URL:
    """The configured database with a `_test` suffix on its name.

    Returned as a URL object, not a string: str(URL) masks the password as
    "***", which would then be sent as the literal password.
    """
    url = make_url(settings.database_url)
    return url.set(database=f"{url.database}_test")


@pytest.fixture(scope="session")
def engine():
    """Create the test database and its schema once per session."""
    url = _test_database_url()
    admin_url = url.set(database="postgres")

    # CREATE DATABASE cannot run inside a transaction, hence AUTOCOMMIT.
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()

    test_engine = create_engine(url, pool_pre_ping=True)
    # create_all rather than running migrations: the migration path is exercised
    # by `alembic upgrade head` in development, and this keeps the suite fast.
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine) -> Generator[Session, None, None]:
    """A session wrapped in a transaction that is rolled back after the test.

    The session is bound to the connection holding the transaction, so even code
    that calls `commit()` (as the routes do) stays inside it and is undone.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def app(db: Session):
    """The application, with its database dependency pointed at the test session."""
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db
    return application


@pytest.fixture
def client(app) -> TestClient:
    """An unauthenticated client."""
    return TestClient(app)


@pytest.fixture
def user(db: Session) -> User:
    row = User(
        username="frontdesk",
        full_name="Front Desk",
        hashed_password=hash_password("physiodesk123"),
    )
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def auth_client(client: TestClient, user: User) -> TestClient:
    """A client carrying a valid bearer token."""
    token = client.post(
        "/auth/login", json={"username": user.username, "password": "physiodesk123"}
    ).json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


# --- domain fixtures -------------------------------------------------------

# 2026-09-21 is a Monday, which keeps weekday-dependent tests readable.
MONDAY = dt.date(2026, 9, 21)
SATURDAY = dt.date(2026, 9, 26)


@pytest.fixture
def therapist(db: Session) -> Therapist:
    """Works Monday-Friday, 09:00-12:00, in 45-minute slots (four per day)."""
    row = Therapist(
        name="Dr. Meera Rao",
        specialty="Sports Rehabilitation",
        work_days=[0, 1, 2, 3, 4],
        start_time=dt.time(9, 0),
        end_time=dt.time(12, 0),
        slot_minutes=45,
    )
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def patient(db: Session, therapist: Therapist) -> Patient:
    row = Patient(name="Anil Shrestha", therapist_id=therapist.id, condition="ACL rehab")
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def invoice(db: Session, patient: Patient) -> Invoice:
    """1000 owed, no discount, nothing paid."""
    row = Invoice(
        patient_id=patient.id,
        service="Therapy session",
        date=MONDAY,
        amount=Decimal("1000.00"),
        discount=Decimal("0.00"),
        paid_amount=Decimal("0.00"),
    )
    db.add(row)
    db.flush()
    return row
