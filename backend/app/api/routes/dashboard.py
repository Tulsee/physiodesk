"""Dashboard summary, capacity strip and recent patients."""

import datetime as dt
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models import Appointment, Invoice, Patient, Payment, Therapist
from app.models.enums import AppointmentStatus, PatientStatus
from app.schemas.common import ORMModel
from app.services import scheduling

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CENTS = Decimal("0.01")


def _money(value: object) -> Decimal:
    """Always two decimal places.

    COALESCE(SUM(...), 0) returns a plain integer when no rows match, which
    would serialize as "0" while a real total serializes as "2000.00". The
    frontend formats currency off these strings, so they must agree.
    """
    return Decimal(str(value)).quantize(CENTS)


class DashboardSummary(ORMModel):
    date: dt.date
    patients_seen_today: int
    appointments_today: int
    therapists_on_duty: int
    revenue_today: Decimal
    open_slots: int
    total_slots: int
    active_patients: int
    outstanding_balance: Decimal


class CapacityEntry(ORMModel):
    therapist_id: int
    therapist_name: str
    booked: int
    total: int
    is_off: bool = False
    off_reason: str | None = None


class RecentPatient(ORMModel):
    patient_id: int
    name: str
    condition: str | None = None
    last_visit: dt.date
    status: PatientStatus


def _capacity(db: DbSession, on_date: dt.date) -> list[CapacityEntry]:
    """Booked-vs-total slots per therapist, from the same engine as the grid."""
    therapists = (
        db.execute(
            select(Therapist)
            .where(Therapist.is_active.is_(True))
            .order_by(Therapist.name)
        )
        .scalars()
        .all()
    )

    entries: list[CapacityEntry] = []
    for therapist in therapists:
        exception = scheduling.get_exception(db, therapist.id, on_date)
        window = scheduling.working_window(therapist, on_date, exception)

        if window is None:
            entries.append(
                CapacityEntry(
                    therapist_id=therapist.id,
                    therapist_name=therapist.name,
                    booked=0,
                    total=0,
                    is_off=True,
                    off_reason=(exception.reason if exception else None)
                    or ("Marked off" if exception else "Not a working day"),
                )
            )
            continue

        appointments = scheduling.get_day_appointments(db, therapist.id, on_date)
        slots = scheduling.generate_slots(window[0], window[1], therapist.slot_minutes)
        booked = sum(
            1
            for s in slots
            if scheduling.find_conflict(appointments, s.start, therapist.slot_minutes)
        )
        entries.append(
            CapacityEntry(
                therapist_id=therapist.id,
                therapist_name=therapist.name,
                booked=booked,
                total=len(slots),
            )
        )

    return entries


@router.get("/summary", response_model=DashboardSummary, summary="Headline numbers")
def get_summary(
    db: DbSession,
    _: CurrentUser,
    date: Annotated[dt.date | None, Query(description="Defaults to today.")] = None,
) -> DashboardSummary:
    on_date = date or dt.date.today()
    capacity = _capacity(db, on_date)

    patients_seen = db.execute(
        select(func.count(func.distinct(Appointment.patient_id))).where(
            Appointment.date == on_date,
            Appointment.status == AppointmentStatus.COMPLETED,
        )
    ).scalar_one()

    appointments_today = db.execute(
        select(func.count())
        .select_from(Appointment)
        .where(
            Appointment.date == on_date,
            Appointment.status.in_(scheduling.BLOCKING_STATUSES),
        )
    ).scalar_one()

    revenue = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.date == on_date
        )
    ).scalar_one()

    active_patients = db.execute(
        select(func.count())
        .select_from(Patient)
        .where(Patient.status == PatientStatus.ACTIVE)
    ).scalar_one()

    outstanding = db.execute(
        select(
            func.coalesce(
                func.sum(Invoice.amount - Invoice.discount - Invoice.paid_amount), 0
            )
        )
    ).scalar_one()

    total_slots = sum(c.total for c in capacity)
    booked_slots = sum(c.booked for c in capacity)

    return DashboardSummary(
        date=on_date,
        patients_seen_today=patients_seen,
        appointments_today=appointments_today,
        therapists_on_duty=sum(1 for c in capacity if not c.is_off),
        revenue_today=_money(revenue),
        open_slots=total_slots - booked_slots,
        total_slots=total_slots,
        active_patients=active_patients,
        outstanding_balance=_money(outstanding),
    )


@router.get("/capacity", response_model=list[CapacityEntry], summary="Capacity strip")
def get_capacity(
    db: DbSession,
    _: CurrentUser,
    date: Annotated[dt.date | None, Query(description="Defaults to today.")] = None,
) -> list[CapacityEntry]:
    return _capacity(db, date or dt.date.today())


@router.get(
    "/recent-patients", response_model=list[RecentPatient], summary="Recent patients"
)
def get_recent_patients(
    db: DbSession,
    _: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=50)] = 8,
) -> list[RecentPatient]:
    """Most recently seen patients, for the clickable dashboard list.

    Ordered by their latest non-cancelled appointment, so a patient booked far
    in advance does not jump the list.
    """
    today = dt.date.today()
    last_visit = (
        select(
            Appointment.patient_id.label("patient_id"),
            func.max(Appointment.date).label("last_visit"),
        )
        .where(
            Appointment.status.in_(scheduling.BLOCKING_STATUSES),
            Appointment.date <= today,
        )
        .group_by(Appointment.patient_id)
        .subquery()
    )

    rows = db.execute(
        select(Patient, last_visit.c.last_visit)
        .join(last_visit, last_visit.c.patient_id == Patient.id)
        .options(selectinload(Patient.therapist))
        .order_by(last_visit.c.last_visit.desc(), Patient.name)
        .limit(limit)
    ).all()

    return [
        RecentPatient(
            patient_id=p.id,
            name=p.name,
            condition=p.condition,
            last_visit=visited,
            status=p.status,
        )
        for p, visited in rows
    ]
