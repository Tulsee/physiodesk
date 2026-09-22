"""Booked appointments. Free slots are derived, never stored."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, ForeignKey, Index, String, Text, Time
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import (
    AppointmentStatus,
    AppointmentType,
    PaymentMethod,
    enum_column,
)

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.therapist import Therapist


class Appointment(Base, TimestampMixin):
    """One booking of a therapist slot.

    A row here marks a derived slot as taken; the schedule grid is built by
    generating slots from working hours and flagging the ones an appointment
    covers (see services/scheduling.py).
    """

    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_therapist_date", "therapist_id", "date"),
        Index("ix_appointments_patient_date", "patient_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    therapist_id: Mapped[int] = mapped_column(
        ForeignKey("therapists.id", ondelete="RESTRICT"), nullable=False
    )

    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    time: Mapped[dt.time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(default=45, nullable=False)

    type: Mapped[AppointmentType] = mapped_column(
        enum_column(AppointmentType, "appointment_type"),
        default=AppointmentType.THERAPY_SESSION,
        nullable=False,
    )
    status: Mapped[AppointmentStatus] = mapped_column(
        enum_column(AppointmentStatus, "appointment_status"),
        default=AppointmentStatus.SCHEDULED,
        nullable=False,
        index=True,
    )

    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        enum_column(PaymentMethod, "payment_method")
    )
    payment_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    notes: Mapped[str | None] = mapped_column(Text)
    outcome_note: Mapped[str | None] = mapped_column(Text)
    cancellation_reason: Mapped[str | None] = mapped_column(String(300))

    patient: Mapped[Patient] = relationship(back_populates="appointments")
    therapist: Mapped[Therapist] = relationship(back_populates="appointments")

    def __repr__(self) -> str:
        return f"<Appointment {self.id} {self.date} {self.time} t={self.therapist_id}>"
