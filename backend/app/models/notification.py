"""Scheduled patient notifications (delivery is simulated)."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import (
    NotificationChannel,
    NotificationStatus,
    NotificationType,
    enum_column,
)

if TYPE_CHECKING:
    from app.models.patient import Patient


class Notification(Base, TimestampMixin):
    """A message queued for a patient.

    Nothing is actually sent: a NotificationSender implementation logs the
    delivery and flips the status, so a real SMS/email provider can replace
    ConsoleSender without touching this model or the routes.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_status_scheduled", "status", "scheduled_for"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    type: Mapped[NotificationType] = mapped_column(
        enum_column(NotificationType, "notification_type", length=40),
        nullable=False,
        index=True,
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        enum_column(NotificationChannel, "notification_channel", length=16),
        nullable=False,
    )
    status: Mapped[NotificationStatus] = mapped_column(
        enum_column(NotificationStatus, "notification_status"),
        default=NotificationStatus.SCHEDULED,
        nullable=False,
        index=True,
    )

    scheduled_for: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    sent_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(300))

    patient: Mapped[Patient] = relationship(back_populates="notifications")

    def __repr__(self) -> str:
        return f"<Notification {self.id} {self.type} {self.status}>"
