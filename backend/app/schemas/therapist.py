"""Therapist and schedule-override payloads."""

import datetime as dt

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import InputModel, ORMModel

# Python weekday numbering, matching date.weekday(): 0 = Monday ... 6 = Sunday.
WorkDays = list[int]


def _validate_work_days(v: WorkDays) -> WorkDays:
    if any(d < 0 or d > 6 for d in v):
        raise ValueError("work_days entries must be 0 (Monday) through 6 (Sunday).")
    return sorted(set(v))


class TherapistBase(InputModel):
    name: str = Field(min_length=1, max_length=120)
    specialty: str = Field(min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = None
    qualifications: str | None = None
    experience_years: int | None = Field(default=None, ge=0, le=70)
    avatar_url: str | None = Field(default=None, max_length=500)

    work_days: WorkDays = Field(
        default_factory=list, description="0 = Monday ... 6 = Sunday."
    )
    start_time: dt.time = dt.time(9, 0)
    end_time: dt.time = dt.time(17, 0)
    slot_minutes: int = Field(default=45, ge=5, le=240)

    _check_days = field_validator("work_days")(_validate_work_days)

    @model_validator(mode="after")
    def _check_window(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time.")
        window = (
            dt.datetime.combine(dt.date.min, self.end_time)
            - dt.datetime.combine(dt.date.min, self.start_time)
        ).total_seconds() / 60
        if window < self.slot_minutes:
            raise ValueError(
                f"Working window is {int(window)} minutes, shorter than one "
                f"{self.slot_minutes}-minute slot."
            )
        return self


class TherapistCreate(TherapistBase):
    pass


class TherapistUpdate(InputModel):
    """Every field optional: routes apply it with exclude_unset so an omitted
    field is left alone rather than overwritten with null."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    specialty: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = None
    qualifications: str | None = None
    experience_years: int | None = Field(default=None, ge=0, le=70)
    avatar_url: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    work_days: WorkDays | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    slot_minutes: int | None = Field(default=None, ge=5, le=240)

    @field_validator("work_days")
    @classmethod
    def _days(cls, v: WorkDays | None) -> WorkDays | None:
        return None if v is None else _validate_work_days(v)

    @model_validator(mode="after")
    def _check_window(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time.")
        return self


class TherapistRead(ORMModel):
    id: int
    name: str
    specialty: str
    email: str | None
    phone: str | None
    bio: str | None
    qualifications: str | None
    experience_years: int | None
    avatar_url: str | None
    is_active: bool
    work_days: WorkDays
    start_time: dt.time
    end_time: dt.time
    slot_minutes: int


class ScheduleExceptionBase(InputModel):
    date: dt.date
    is_off: bool = False
    custom_start: dt.time | None = None
    custom_end: dt.time | None = None
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check_shape(self):
        if self.is_off:
            if self.custom_start or self.custom_end:
                raise ValueError("A day marked is_off cannot also carry custom hours.")
            return self

        if not (self.custom_start and self.custom_end):
            raise ValueError(
                "An override must either set is_off, or provide both "
                "custom_start and custom_end."
            )
        if self.custom_end <= self.custom_start:
            raise ValueError("custom_end must be after custom_start.")
        return self


class ScheduleExceptionCreate(ScheduleExceptionBase):
    pass


class ScheduleExceptionRead(ORMModel):
    id: int
    therapist_id: int
    date: dt.date
    is_off: bool
    custom_start: dt.time | None
    custom_end: dt.time | None
    reason: str | None
