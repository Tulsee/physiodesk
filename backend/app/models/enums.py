"""Domain enums, shared by the SQLAlchemy models and the Pydantic schemas."""

from enum import Enum
from typing import TypeVar

from sqlalchemy import Enum as SAEnum

E = TypeVar("E", bound=Enum)


def enum_column(enum_cls: type[E], name: str, length: int = 32) -> SAEnum:
    """Build the Enum column type used throughout the schema.

    - ``native_enum=False`` stores a VARCHAR rather than a Postgres ENUM type, so
      adding a member later is an ordinary migration rather than an ALTER TYPE.
    - ``create_constraint=True`` is required: SQLAlchemy defaults it to False, which
      would leave the column a bare VARCHAR accepting any string at all.
    - ``values_callable`` persists the member *value* (``"on_hold"``) instead of
      SQLAlchemy's default member *name* (``"ON_HOLD"``), which keeps the stored
      rows identical to what the API returns.
    """
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda cls: [m.value for m in cls],
    )


class UserRole(str, Enum):
    FRONT_DESK = "front_desk"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class PatientStatus(str, Enum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    DISCHARGED = "discharged"


class AppointmentType(str, Enum):
    INITIAL_ASSESSMENT = "initial_assessment"
    FOLLOW_UP = "follow_up"
    THERAPY_SESSION = "therapy_session"
    REVIEW = "review"


class AppointmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    ONLINE = "online"
    BANK_TRANSFER = "bank_transfer"
    INSURANCE = "insurance"


class InvoiceStatus(str, Enum):
    """Never set by a client — always derived from the invoice's payments.

    See services/billing.py for the rules.
    """

    DUE = "due"
    PARTIAL = "partial"
    PAID = "paid"
    REFUNDED = "refunded"


class NotificationType(str, Enum):
    APPOINTMENT_REMINDER = "appointment_reminder"
    PAYMENT_REMINDER = "payment_reminder"
    FOLLOW_UP = "follow_up"
    EXERCISE_REMINDER = "exercise_reminder"


class NotificationChannel(str, Enum):
    SMS = "sms"
    EMAIL = "email"
    WHATSAPP = "whatsapp"


class NotificationStatus(str, Enum):
    SCHEDULED = "scheduled"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"
