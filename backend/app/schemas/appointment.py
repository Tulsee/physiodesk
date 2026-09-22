"""Appointment payloads and the derived schedule grid."""

import datetime as dt
from typing import Any

from pydantic import Field

from app.models.enums import AppointmentStatus, AppointmentType, PaymentMethod
from app.schemas.common import InputModel, ORMModel


class AppointmentCreate(InputModel):
    patient_id: int
    therapist_id: int
    date: dt.date
    time: dt.time
    duration_minutes: int = Field(default=45, ge=5, le=240)
    type: AppointmentType = AppointmentType.THERAPY_SESSION
    payment_method: PaymentMethod | None = None
    payment_details: dict[str, Any] | None = None
    notes: str | None = None


class AppointmentUpdate(InputModel):
    """Covers reschedule (date/time), cancel (status) and post-session notes."""

    date: dt.date | None = None
    time: dt.time | None = None
    therapist_id: int | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=240)
    type: AppointmentType | None = None
    status: AppointmentStatus | None = None
    payment_method: PaymentMethod | None = None
    payment_details: dict[str, Any] | None = None
    notes: str | None = None
    outcome_note: str | None = None
    cancellation_reason: str | None = Field(default=None, max_length=300)


class AppointmentRead(ORMModel):
    id: int
    patient_id: int
    therapist_id: int
    date: dt.date
    time: dt.time
    duration_minutes: int
    type: AppointmentType
    status: AppointmentStatus
    payment_method: PaymentMethod | None
    payment_details: dict[str, Any] | None
    notes: str | None
    outcome_note: str | None
    cancellation_reason: str | None


class AppointmentDetail(AppointmentRead):
    """Adds the names the schedule grid and detail modal display."""

    patient_name: str | None = None
    therapist_name: str | None = None


class Slot(ORMModel):
    """One derived slot. Never stored — generated from working hours per request."""

    time: dt.time
    end_time: dt.time
    is_booked: bool
    appointment: AppointmentDetail | None = None


class TherapistDaySchedule(ORMModel):
    therapist_id: int
    therapist_name: str
    slots: list[Slot] = []
    is_off: bool = False
    off_reason: str | None = None


class DaySchedule(ORMModel):
    """The schedule grid: one column per therapist for a single date."""

    date: dt.date
    therapists: list[TherapistDaySchedule] = []
