"""Invoices and the payment events that determine their status."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.enums import InvoiceStatus, PaymentMethod, enum_column

if TYPE_CHECKING:
    from app.models.patient import Patient

Money = Numeric(10, 2)


class Invoice(Base, TimestampMixin):
    """A bill for one service.

    ``status`` and ``paid_amount`` are a denormalized cache of the payment rows —
    recomputed inside the same transaction as every payment write, so reads stay
    a single row lookup while writes stay correct. See services/billing.py.
    """

    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_invoice_amount_non_negative"),
        CheckConstraint("discount >= 0", name="ck_invoice_discount_non_negative"),
        CheckConstraint("discount <= amount", name="ck_invoice_discount_within_amount"),
        Index("ix_invoices_patient_date", "patient_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )

    service: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)

    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    discount: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0.00"), nullable=False
    )

    # --- derived cache ---
    paid_amount: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0.00"), nullable=False
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        enum_column(InvoiceStatus, "invoice_status"),
        default=InvoiceStatus.DUE,
        nullable=False,
        index=True,
    )

    notes: Mapped[str | None] = mapped_column(Text)

    patient: Mapped[Patient] = relationship(back_populates="invoices")
    payments: Mapped[list[Payment]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="Payment.date, Payment.id",
    )

    @property
    def net_due(self) -> Decimal:
        """What the patient still owes: amount - discount - payments received."""
        return self.amount - self.discount - self.paid_amount

    def __repr__(self) -> str:
        return f"<Invoice {self.id} {self.service} {self.status}>"


class Payment(Base, TimestampMixin):
    """One money movement against an invoice.

    A refund is a negative ``amount`` rather than a separate table or a flag, so
    the rows read as an append-only ledger and the balance is just their sum.
    """

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount <> 0", name="ck_payment_amount_non_zero"),
        Index("ix_payments_invoice_date", "invoice_id", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )

    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        enum_column(PaymentMethod, "payment_method"), nullable=False
    )
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(String(300))

    invoice: Mapped[Invoice] = relationship(back_populates="payments")

    @property
    def is_refund(self) -> bool:
        return self.amount < 0

    def __repr__(self) -> str:
        kind = "refund" if self.is_refund else "payment"
        return f"<Payment {self.id} {kind} {self.amount}>"
