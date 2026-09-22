"""Clinical notes — the single source the progress charts are derived from."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.therapist import Therapist


class ClinicalNote(Base, TimestampMixin):
    """One session's clinical record, in SOAP shape.

    The three scores double as the progress chart series, so there is no
    separate "progress entry" to keep in sync with the notes.
    """

    __tablename__ = "clinical_notes"
    __table_args__ = (
        CheckConstraint(
            "pain_score IS NULL OR pain_score BETWEEN 0 AND 10", name="ck_pain_score"
        ),
        CheckConstraint(
            "rom_score IS NULL OR rom_score BETWEEN 0 AND 100", name="ck_rom_score"
        ),
        CheckConstraint(
            "strength_score IS NULL OR strength_score BETWEEN 0 AND 5",
            name="ck_strength_score",
        ),
        Index("ix_clinical_notes_patient_date", "patient_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    therapist_id: Mapped[int | None] = mapped_column(
        ForeignKey("therapists.id", ondelete="SET NULL"), index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)

    # --- SOAP ---
    subjective: Mapped[str | None] = mapped_column(Text)
    objective: Mapped[str | None] = mapped_column(Text)
    assessment: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str | None] = mapped_column(Text)

    treatment_given: Mapped[str | None] = mapped_column(Text)
    exercises_prescribed: Mapped[str | None] = mapped_column(Text)

    # --- charted measures ---
    pain_score: Mapped[int | None] = mapped_column(SmallInteger)
    rom_score: Mapped[int | None] = mapped_column(SmallInteger)
    strength_score: Mapped[int | None] = mapped_column(SmallInteger)

    milestone: Mapped[str | None] = mapped_column(String(200))

    patient: Mapped[Patient] = relationship(back_populates="clinical_notes")
    therapist: Mapped[Therapist | None] = relationship(back_populates="clinical_notes")

    def __repr__(self) -> str:
        return f"<ClinicalNote {self.id} p={self.patient_id} {self.date}>"
