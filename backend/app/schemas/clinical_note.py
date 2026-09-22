"""Clinical note payloads and the derived progress series."""

import datetime as dt

from pydantic import Field

from app.schemas.common import InputModel, ORMModel

PainScore = int | None
RomScore = int | None
StrengthScore = int | None


class ClinicalNoteBase(InputModel):
    date: dt.date
    therapist_id: int | None = None

    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    treatment_given: str | None = None
    exercises_prescribed: str | None = None

    pain_score: int | None = Field(default=None, ge=0, le=10)
    rom_score: int | None = Field(default=None, ge=0, le=100)
    strength_score: int | None = Field(default=None, ge=0, le=5)

    milestone: str | None = Field(default=None, max_length=200)


class ClinicalNoteCreate(ClinicalNoteBase):
    pass


class ClinicalNoteUpdate(InputModel):
    date: dt.date | None = None
    therapist_id: int | None = None
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    treatment_given: str | None = None
    exercises_prescribed: str | None = None
    pain_score: int | None = Field(default=None, ge=0, le=10)
    rom_score: int | None = Field(default=None, ge=0, le=100)
    strength_score: int | None = Field(default=None, ge=0, le=5)
    milestone: str | None = Field(default=None, max_length=200)


class ClinicalNoteRead(ORMModel):
    id: int
    patient_id: int
    therapist_id: int | None
    date: dt.date
    subjective: str | None
    objective: str | None
    assessment: str | None
    plan: str | None
    treatment_given: str | None
    exercises_prescribed: str | None
    pain_score: int | None
    rom_score: int | None
    strength_score: int | None
    milestone: str | None
    created_at: dt.datetime


class ProgressPoint(ORMModel):
    date: dt.date
    value: int


class MilestonePoint(ORMModel):
    date: dt.date
    milestone: str


class ProgressSeries(ORMModel):
    """Charts for the patient profile, derived entirely from clinical notes.

    A series with fewer than two points renders as an empty state rather than a
    single meaningless dot; the frontend decides using `len(...)`.
    """

    patient_id: int
    pain: list[ProgressPoint] = []
    rom: list[ProgressPoint] = []
    strength: list[ProgressPoint] = []
    milestones: list[MilestonePoint] = []
