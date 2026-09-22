"""The schedule grid and appointment booking."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import Appointment, Patient, Therapist
from app.models.enums import AppointmentStatus
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDetail,
    AppointmentUpdate,
    DaySchedule,
    Slot,
    TherapistDaySchedule,
)
from app.schemas.common import Page
from app.services import scheduling

router = APIRouter(tags=["schedule"])


def _detail(appt: Appointment) -> AppointmentDetail:
    """Appointment plus the names the grid and detail modal display."""
    d = AppointmentDetail.model_validate(appt)
    d.patient_name = appt.patient.name if appt.patient else None
    d.therapist_name = appt.therapist.name if appt.therapist else None
    return d


def _appointment_or_404(db: DbSession, appointment_id: int) -> Appointment:
    appt = db.execute(
        select(Appointment)
        .options(selectinload(Appointment.patient), selectinload(Appointment.therapist))
        .where(Appointment.id == appointment_id)
    ).scalar_one_or_none()
    if appt is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Appointment {appointment_id} not found."
        )
    return appt


# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------


@router.get("/schedule", response_model=DaySchedule, summary="Day schedule grid")
def get_day_schedule(
    db: DbSession,
    _: CurrentUser,
    date: Annotated[dt.date | None, Query(description="Defaults to today.")] = None,
    therapist_id: Annotated[
        int | None, Query(description="Limit to one therapist.")
    ] = None,
) -> DaySchedule:
    """Therapists x derived slots for one date.

    Every slot here is generated from working hours: none of this is stored.
    """
    on_date = date or dt.date.today()

    stmt = select(Therapist).where(Therapist.is_active.is_(True))
    if therapist_id is not None:
        stmt = stmt.where(Therapist.id == therapist_id)
    therapists = list(db.execute(stmt.order_by(Therapist.name)).scalars().all())

    columns: list[TherapistDaySchedule] = []
    for therapist in therapists:
        exception = scheduling.get_exception(db, therapist.id, on_date)
        window = scheduling.working_window(therapist, on_date, exception)

        if window is None:
            columns.append(
                TherapistDaySchedule(
                    therapist_id=therapist.id,
                    therapist_name=therapist.name,
                    slots=[],
                    is_off=True,
                    off_reason=(exception.reason if exception else None)
                    or ("Marked off" if exception else "Not a working day"),
                )
            )
            continue

        appointments = scheduling.get_day_appointments(db, therapist.id, on_date)
        start, end = window

        slots: list[Slot] = []
        for w in scheduling.generate_slots(start, end, therapist.slot_minutes):
            booked = scheduling.find_conflict(
                appointments, w.start, therapist.slot_minutes
            )
            slots.append(
                Slot(
                    time=w.start,
                    end_time=w.end,
                    is_booked=booked is not None,
                    appointment=_detail(booked) if booked else None,
                )
            )

        columns.append(
            TherapistDaySchedule(
                therapist_id=therapist.id, therapist_name=therapist.name, slots=slots
            )
        )

    return DaySchedule(date=on_date, therapists=columns)


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------


@router.get(
    "/appointments", response_model=Page[AppointmentDetail], summary="List appointments"
)
def list_appointments(
    db: DbSession,
    _: CurrentUser,
    pg: PaginationDep,
    patient_id: Annotated[int | None, Query()] = None,
    therapist_id: Annotated[int | None, Query()] = None,
    date_from: Annotated[dt.date | None, Query()] = None,
    date_to: Annotated[dt.date | None, Query()] = None,
    status_filter: Annotated[AppointmentStatus | None, Query(alias="status")] = None,
) -> Page[AppointmentDetail]:
    stmt = select(Appointment).options(
        selectinload(Appointment.patient), selectinload(Appointment.therapist)
    )

    if patient_id is not None:
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if therapist_id is not None:
        stmt = stmt.where(Appointment.therapist_id == therapist_id)
    if date_from is not None:
        stmt = stmt.where(Appointment.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Appointment.date <= date_to)
    if status_filter is not None:
        stmt = stmt.where(Appointment.status == status_filter)

    stmt = stmt.order_by(Appointment.date.desc(), Appointment.time.desc())
    rows, total = paginate(db, stmt, pg)
    return Page[AppointmentDetail].build(
        [_detail(r) for r in rows], total, pg.page, pg.page_size
    )


@router.get(
    "/appointments/{appointment_id}",
    response_model=AppointmentDetail,
    summary="Get one",
)
def get_appointment(
    appointment_id: int, db: DbSession, _: CurrentUser
) -> AppointmentDetail:
    return _detail(_appointment_or_404(db, appointment_id))


def _validate_booking(
    db: DbSession,
    therapist: Therapist,
    on_date: dt.date,
    time: dt.time,
    duration: int,
    exclude_id: int | None = None,
) -> None:
    """Reject bookings outside working hours or on top of another appointment."""
    exception = scheduling.get_exception(db, therapist.id, on_date)

    if not scheduling.is_within_working_hours(
        therapist, on_date, exception, time, duration
    ):
        window = scheduling.working_window(therapist, on_date, exception)
        if window is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{therapist.name} is not working on {on_date.isoformat()}.",
            )
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{time.strftime('%H:%M')} plus {duration} minutes falls outside "
            f"{therapist.name}'s hours on {on_date.isoformat()} "
            f"({window[0].strftime('%H:%M')}-{window[1].strftime('%H:%M')}).",
        )

    clash = scheduling.find_conflict(
        scheduling.get_day_appointments(db, therapist.id, on_date),
        time,
        duration,
        exclude_id=exclude_id,
    )
    if clash is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{therapist.name} already has an appointment at "
            f"{clash.time.strftime('%H:%M')} on {on_date.isoformat()}.",
        )


@router.post(
    "/appointments",
    response_model=AppointmentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Book an appointment",
)
def create_appointment(
    payload: AppointmentCreate, db: DbSession, _: CurrentUser
) -> AppointmentDetail:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Patient {payload.patient_id} does not exist.",
        )
    therapist = db.get(Therapist, payload.therapist_id)
    if therapist is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Therapist {payload.therapist_id} does not exist.",
        )

    _validate_booking(
        db, therapist, payload.date, payload.time, payload.duration_minutes
    )

    appt = Appointment(**payload.model_dump())
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return _detail(appt)


@router.patch(
    "/appointments/{appointment_id}",
    response_model=AppointmentDetail,
    summary="Reschedule, cancel, or annotate",
)
def update_appointment(
    appointment_id: int, payload: AppointmentUpdate, db: DbSession, _: CurrentUser
) -> AppointmentDetail:
    appt = _appointment_or_404(db, appointment_id)
    data = payload.model_dump(exclude_unset=True)

    new_status = data.get("status", appt.status)
    moving = any(
        k in data for k in ("date", "time", "therapist_id", "duration_minutes")
    )

    if moving and new_status in scheduling.BLOCKING_STATUSES:
        therapist_id = data.get("therapist_id", appt.therapist_id)
        therapist = db.get(Therapist, therapist_id)
        if therapist is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Therapist {therapist_id} does not exist.",
            )
        _validate_booking(
            db,
            therapist,
            data.get("date", appt.date),
            data.get("time", appt.time),
            data.get("duration_minutes", appt.duration_minutes),
            exclude_id=appt.id,
        )

    for field, value in data.items():
        setattr(appt, field, value)

    db.commit()
    db.refresh(appt)
    return _detail(appt)


@router.delete(
    "/appointments/{appointment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an appointment",
)
def delete_appointment(appointment_id: int, db: DbSession, _: CurrentUser) -> None:
    """Hard delete, for a booking made in error.

    Cancelling (PATCH status=cancelled) is the normal path: it frees the slot
    while keeping the record.
    """
    db.delete(_appointment_or_404(db, appointment_id))
    db.commit()
