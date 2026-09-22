"""Therapists and their per-date working-hour overrides."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
)
from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.clinical_note import ClinicalNote
    from app.models.patient import Patient


class Therapist(Base, TimestampMixin):
    """A practitioner, plus the default working pattern their slots derive from."""

    __tablename__ = "therapists"

    id: Mapped[int] = mapped_column(primary_key=True)

    # --- profile ---
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    specialty: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(160), unique=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    bio: Mapped[str | None] = mapped_column(Text)
    qualifications: Mapped[str | None] = mapped_column(Text)
    experience_years: Mapped[int | None] = mapped_column(SmallInteger)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    work_days: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), default=list, server_default="{}", nullable=False
    )
    start_time: Mapped[dt.time] = mapped_column(
        Time, default=dt.time(9, 0), nullable=False
    )
    end_time: Mapped[dt.time] = mapped_column(
        Time, default=dt.time(17, 0), nullable=False
    )
    slot_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)

    # --- relationships ---
    schedule_exceptions: Mapped[list[ScheduleException]] = relationship(
        back_populates="therapist", cascade="all, delete-orphan"
    )
    patients: Mapped[list[Patient]] = relationship(back_populates="therapist")
    appointments: Mapped[list[Appointment]] = relationship(back_populates="therapist")
    clinical_notes: Mapped[list[ClinicalNote]] = relationship(
        back_populates="therapist"
    )

    def __repr__(self) -> str:
        return f"<Therapist {self.id} {self.name}>"


class ScheduleException(Base, TimestampMixin):
    """Overrides a therapist's default hours for one date.

    Two shapes:
      - ``is_off=True``  -> no slots that day (leave, holiday)
      - ``is_off=False`` -> work ``custom_start``..``custom_end`` instead of the default,
        which also turns a normally non-working day into a working one.
    """

    __tablename__ = "schedule_exceptions"
    __table_args__ = (
        UniqueConstraint(
            "therapist_id", "date", name="uq_schedule_exception_therapist_date"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    therapist_id: Mapped[int] = mapped_column(
        ForeignKey("therapists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    is_off: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    custom_start: Mapped[dt.time | None] = mapped_column(Time)
    custom_end: Mapped[dt.time | None] = mapped_column(Time)
    reason: Mapped[str | None] = mapped_column(String(200))

    therapist: Mapped[Therapist] = relationship(back_populates="schedule_exceptions")

    def __repr__(self) -> str:
        return (
            f"<ScheduleException t={self.therapist_id} {self.date} off={self.is_off}>"
        )
