"""Patients under treatment at the clinic."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import Gender, PatientStatus, enum_column

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.billing import Invoice
    from app.models.clinical_note import ClinicalNote
    from app.models.notification import Notification
    from app.models.report_file import ReportFile
    from app.models.therapist import Therapist


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    age: Mapped[int | None] = mapped_column(SmallInteger)
    gender: Mapped[Gender | None] = mapped_column(
        enum_column(Gender, "gender", length=16)
    )
    phone: Mapped[str | None] = mapped_column(String(32), index=True)
    email: Mapped[str | None] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(Text)

    condition: Mapped[str | None] = mapped_column(String(200))
    therapist_id: Mapped[int | None] = mapped_column(
        ForeignKey("therapists.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[PatientStatus] = mapped_column(
        enum_column(PatientStatus, "patient_status"),
        default=PatientStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    # --- package tracking ---
    package: Mapped[str | None] = mapped_column(String(120))
    sessions_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sessions_total: Mapped[int | None] = mapped_column(Integer)

    notes: Mapped[str | None] = mapped_column(Text)

    # --- relationships ---
    therapist: Mapped[Therapist | None] = relationship(back_populates="patients")
    appointments: Mapped[list[Appointment]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    clinical_notes: Mapped[list[ClinicalNote]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    reports: Mapped[list[ReportFile]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    invoices: Mapped[list[Invoice]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Patient {self.id} {self.name}>"
