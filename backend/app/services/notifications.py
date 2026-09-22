"""Notification delivery.

Delivery is simulated. ``NotificationSender`` is the seam: swapping ConsoleSender
for a Twilio or SendGrid implementation means writing one class and changing the
factory below — no route or model changes.
"""

import logging
from typing import Protocol

from app.models import Notification
from app.models.enums import NotificationChannel

logger = logging.getLogger("physiodesk.notifications")


class SendResult:
    """Outcome of one delivery attempt."""

    def __init__(self, ok: bool, error: str | None = None) -> None:
        self.ok = ok
        self.error = error

    @classmethod
    def success(cls) -> "SendResult":
        return cls(True)

    @classmethod
    def failure(cls, error: str) -> "SendResult":
        return cls(False, error)


class NotificationSender(Protocol):
    """What a delivery backend must implement."""

    def send(self, notification: Notification, recipient: str | None) -> SendResult: ...


class ConsoleSender:
    """Logs the message instead of sending it.

    Still validates that a usable address exists for the channel, so the
    simulation exercises the same failure path a real provider would.
    """

    def send(self, notification: Notification, recipient: str | None) -> SendResult:
        if not recipient:
            channel = notification.channel
            missing = (
                "email address"
                if channel is NotificationChannel.EMAIL
                else "phone number"
            )
            return SendResult.failure(
                f"Patient has no {missing} on file for {channel.value}."
            )

        logger.info(
            "[%s] -> %s | %s: %s",
            notification.channel.value.upper(),
            recipient,
            notification.type.value,
            notification.message,
        )
        return SendResult.success()


def recipient_for(notification: Notification) -> str | None:
    """The address a notification would go to, given its channel."""
    patient = notification.patient
    if patient is None:
        return None
    if notification.channel is NotificationChannel.EMAIL:
        return patient.email
    return patient.phone


def get_sender() -> NotificationSender:
    """The active backend. A real provider is selected here."""
    return ConsoleSender()
