"""Slot derivation.

Slots are never stored. They are generated per request from a therapist's
working pattern, then marked booked where an appointment overlaps. One engine
powers the schedule grid, the dashboard capacity strip and the therapist
profile's day view, so they cannot disagree.

The pure functions at the top take plain values and are unit-testable without a
database; the query layer below assembles them.
"""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, ScheduleException, Therapist
from app.models.enums import AppointmentStatus

BLOCKING_STATUSES = (
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
)


@dataclass(frozen=True)
class SlotWindow:
    start: dt.time
    end: dt.time


def _combine(t: dt.time) -> dt.datetime:
    """Put a time on a fixed date so arithmetic works. Never crosses midnight."""
    return dt.datetime.combine(dt.date.min, t)


def working_window(
    therapist: Therapist, on_date: dt.date, exception: ScheduleException | None
) -> tuple[dt.time, dt.time] | None:
    """The hours a therapist works on one date, or None if they do not.

    Precedence, highest first:
      1. an override marked ``is_off``  -> not working
      2. an override with custom hours  -> those hours, even on a normal day off
      3. the date falls on a work day   -> the default hours
      4. otherwise                      -> not working
    """
    if exception is not None:
        if exception.is_off:
            return None
        if exception.custom_start and exception.custom_end:
            return exception.custom_start, exception.custom_end

    if on_date.weekday() in (therapist.work_days or []):
        return therapist.start_time, therapist.end_time

    return None


def generate_slots(start: dt.time, end: dt.time, slot_minutes: int) -> list[SlotWindow]:
    """Fixed-length slots from start to end.

    A trailing gap shorter than one slot is dropped rather than emitted short:
    a 20-minute remainder is not a bookable 45-minute appointment.
    """
    if slot_minutes <= 0:
        raise ValueError("slot_minutes must be positive.")

    slots: list[SlotWindow] = []
    cursor = _combine(start)
    limit = _combine(end)
    step = dt.timedelta(minutes=slot_minutes)

    while cursor + step <= limit:
        slots.append(SlotWindow(start=cursor.time(), end=(cursor + step).time()))
        cursor += step

    return slots


def overlaps(
    a_start: dt.time, a_minutes: int, b_start: dt.time, b_minutes: int
) -> bool:
    """Half-open interval overlap: [start, start+minutes).

    Half-open so a 09:00-09:45 appointment does not collide with 09:45-10:30.
    Comparing intervals rather than start times means an appointment longer than
    one slot correctly blocks every slot it covers.
    """
    a0 = _combine(a_start)
    a1 = a0 + dt.timedelta(minutes=a_minutes)
    b0 = _combine(b_start)
    b1 = b0 + dt.timedelta(minutes=b_minutes)
    return a0 < b1 and b0 < a1


def find_conflict(
    appointments: list[Appointment],
    time: dt.time,
    duration_minutes: int,
    exclude_id: int | None = None,
) -> Appointment | None:
    """The first appointment overlapping the given window, if any.

    ``exclude_id`` lets a reschedule ignore the appointment being moved, which
    would otherwise always conflict with itself.
    """
    for appt in appointments:
        if exclude_id is not None and appt.id == exclude_id:
            continue
        if appt.status not in BLOCKING_STATUSES:
            continue
        if overlaps(time, duration_minutes, appt.time, appt.duration_minutes):
            return appt
    return None


# ---------------------------------------------------------------------------
# Query layer
# ---------------------------------------------------------------------------


def get_exception(
    db: Session, therapist_id: int, on_date: dt.date
) -> ScheduleException | None:
    return db.execute(
        select(ScheduleException).where(
            ScheduleException.therapist_id == therapist_id,
            ScheduleException.date == on_date,
        )
    ).scalar_one_or_none()


def get_day_appointments(
    db: Session, therapist_id: int, on_date: dt.date, include_cancelled: bool = True
) -> list[Appointment]:
    stmt = select(Appointment).where(
        Appointment.therapist_id == therapist_id, Appointment.date == on_date
    )
    if not include_cancelled:
        stmt = stmt.where(Appointment.status.in_(BLOCKING_STATUSES))
    return list(db.execute(stmt.order_by(Appointment.time)).scalars().all())


def is_within_working_hours(
    therapist: Therapist,
    on_date: dt.date,
    exception: ScheduleException | None,
    time: dt.time,
    duration_minutes: int,
) -> bool:
    """Whether a booking fits inside the therapist's hours for that date.

    Checked against the window rather than the slot list, so a booking that
    starts on a slot boundary but runs past closing time is still rejected.
    """
    window = working_window(therapist, on_date, exception)
    if window is None:
        return False
    start, end = window
    booking_end = _combine(time) + dt.timedelta(minutes=duration_minutes)
    return time >= start and booking_end <= _combine(end)
