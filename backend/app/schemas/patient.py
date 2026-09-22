"""Patient payloads."""

import datetime as dt

from pydantic import EmailStr, Field, model_validator

from app.models.enums import Gender, PatientStatus
from app.schemas.common import InputModel, ORMModel
from app.schemas.therapist import TherapistRead


class PatientBase(InputModel):
    name: str = Field(min_length=1, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    gender: Gender | None = None
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    address: str | None = None

    condition: str | None = Field(default=None, max_length=200)
    therapist_id: int | None = None
    status: PatientStatus = PatientStatus.ACTIVE

    package: str | None = Field(default=None, max_length=120)
    sessions_used: int = Field(default=0, ge=0)
    sessions_total: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @model_validator(mode="after")
    def _check_sessions(self):
        if self.sessions_total is not None and self.sessions_used > self.sessions_total:
            raise ValueError("sessions_used cannot exceed sessions_total.")
        return self


class PatientCreate(PatientBase):
    pass


class PatientUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    gender: Gender | None = None
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    address: str | None = None
    condition: str | None = Field(default=None, max_length=200)
    therapist_id: int | None = None
    status: PatientStatus | None = None
    package: str | None = Field(default=None, max_length=120)
    sessions_used: int | None = Field(default=None, ge=0)
    sessions_total: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @model_validator(mode="after")
    def _check_sessions(self):
        if (
            self.sessions_used is not None
            and self.sessions_total is not None
            and self.sessions_used > self.sessions_total
        ):
            raise ValueError("sessions_used cannot exceed sessions_total.")
        return self


class PatientRead(ORMModel):
    id: int
    name: str
    age: int | None
    gender: Gender | None
    phone: str | None
    email: str | None
    address: str | None
    condition: str | None
    therapist_id: int | None
    status: PatientStatus
    package: str | None
    sessions_used: int
    sessions_total: int | None
    notes: str | None
    created_at: dt.datetime


class PatientDetail(PatientRead):
    """Patient with the assigned therapist inlined, for the profile page."""

    therapist: TherapistRead | None = None
