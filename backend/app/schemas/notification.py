"""Notification payloads."""

import datetime as dt

from pydantic import Field

from app.models.enums import NotificationChannel, NotificationStatus, NotificationType
from app.schemas.common import InputModel, ORMModel


class NotificationCreate(InputModel):
    patient_id: int
    type: NotificationType
    channel: NotificationChannel
    scheduled_for: dt.datetime
    message: str = Field(min_length=1)


class NotificationUpdate(InputModel):
    type: NotificationType | None = None
    channel: NotificationChannel | None = None
    scheduled_for: dt.datetime | None = None
    message: str | None = Field(default=None, min_length=1)


class NotificationRead(ORMModel):
    id: int
    patient_id: int
    type: NotificationType
    channel: NotificationChannel
    status: NotificationStatus
    scheduled_for: dt.datetime
    sent_at: dt.datetime | None
    message: str
    failure_reason: str | None


class NotificationDetail(NotificationRead):
    patient_name: str | None = None
