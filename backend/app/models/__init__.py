"""Importing this package registers every model on Base.metadata.

alembic/env.py imports it so --autogenerate sees the full schema.
"""

from app.models.appointment import Appointment
from app.models.billing import Invoice, Payment
from app.models.clinical_note import ClinicalNote
from app.models.enums import (
    AppointmentStatus,
    AppointmentType,
    Gender,
    InvoiceStatus,
    NotificationChannel,
    NotificationStatus,
    NotificationType,
    PatientStatus,
    PaymentMethod,
    UserRole,
)
from app.models.notification import Notification
from app.models.patient import Patient
from app.models.report_file import ReportFile
from app.models.therapist import ScheduleException, Therapist
from app.models.user import User

__all__ = [
    "Appointment",
    "AppointmentStatus",
    "AppointmentType",
    "ClinicalNote",
    "Gender",
    "Invoice",
    "InvoiceStatus",
    "Notification",
    "NotificationChannel",
    "NotificationStatus",
    "NotificationType",
    "Patient",
    "PatientStatus",
    "Payment",
    "PaymentMethod",
    "ReportFile",
    "ScheduleException",
    "Therapist",
    "User",
    "UserRole",
]
