"""Invoice, payment and receipt payloads."""

import datetime as dt
from decimal import Decimal
from typing import Any

from pydantic import Field, model_validator

from app.models.enums import InvoiceStatus, PaymentMethod
from app.schemas.common import InputModel, ORMModel

Money = Decimal


class InvoiceCreate(InputModel):
    patient_id: int
    service: str = Field(min_length=1, max_length=200)
    date: dt.date
    amount: Money = Field(ge=0, max_digits=10, decimal_places=2)
    discount: Money = Field(
        default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2
    )
    notes: str | None = None

    @model_validator(mode="after")
    def _check_discount(self):
        if self.discount > self.amount:
            raise ValueError("discount cannot exceed amount.")
        return self


class InvoiceUpdate(InputModel):
    service: str | None = Field(default=None, min_length=1, max_length=200)
    date: dt.date | None = None
    amount: Money | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    discount: Money | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    notes: str | None = None

    @model_validator(mode="after")
    def _check_discount(self):
        if (
            self.amount is not None
            and self.discount is not None
            and self.discount > self.amount
        ):
            raise ValueError("discount cannot exceed amount.")
        return self


class PaymentCreate(InputModel):
    """One money movement. A negative amount is a refund.

    The route enforces the rules that need the invoice: a payment cannot exceed
    the outstanding balance, and a refund cannot exceed what was actually paid.
    """

    date: dt.date
    amount: Money = Field(
        max_digits=10,
        decimal_places=2,
        description="Positive for a payment, negative for a refund.",
    )
    method: PaymentMethod
    details: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _non_zero(self):
        if self.amount == 0:
            raise ValueError(
                "amount must be non-zero: positive to pay, negative to refund."
            )
        return self


class PaymentRead(ORMModel):
    id: int
    invoice_id: int
    date: dt.date
    amount: Money
    method: PaymentMethod
    details: dict[str, Any] | None
    note: str | None
    is_refund: bool


class InvoiceRead(ORMModel):
    id: int
    patient_id: int
    service: str
    date: dt.date
    amount: Money
    discount: Money
    paid_amount: Money
    status: InvoiceStatus
    notes: str | None
    net_due: Money


class InvoiceDetail(InvoiceRead):
    """Invoice with its full payment ledger, for the detail view."""

    patient_name: str | None = None
    payments: list[PaymentRead] = []


class Receipt(ORMModel):
    """Structured receipt data; the frontend renders the printable view."""

    invoice_id: int
    issued_at: dt.datetime
    patient_name: str
    patient_phone: str | None = None
    service: str
    date: dt.date
    amount: Money
    discount: Money
    paid_amount: Money
    net_due: Money
    status: InvoiceStatus
    payments: list[PaymentRead] = []
