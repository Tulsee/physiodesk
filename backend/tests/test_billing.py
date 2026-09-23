"""Invoice balance and status arithmetic.

Pure functions from `services/billing.py`. Money is the other place a subtle
error is expensive, so the status transitions are enumerated exhaustively.
"""

import datetime as dt
from decimal import Decimal

import pytest

from app.models import Invoice, Payment
from app.models.enums import InvoiceStatus
from app.services.billing import (
    balance_due,
    derive_status,
    payable,
    total_paid,
    validate_payment,
)

TODAY = dt.date(2026, 9, 21)


def make_invoice(amount: str, discount: str = "0.00") -> Invoice:
    return Invoice(
        patient_id=1,
        service="Therapy session",
        date=TODAY,
        amount=Decimal(amount),
        discount=Decimal(discount),
    )


def make_payment(amount: str) -> Payment:
    return Payment(invoice_id=1, date=TODAY, amount=Decimal(amount), method="cash")


class TestDeriveStatus:
    def test_no_payments_is_due(self):
        assert derive_status(make_invoice("1000"), []) is InvoiceStatus.DUE

    def test_part_payment_is_partial(self):
        assert derive_status(make_invoice("1000"), [make_payment("400")]) is InvoiceStatus.PARTIAL

    def test_exact_payment_is_paid(self):
        assert derive_status(make_invoice("1000"), [make_payment("1000")]) is InvoiceStatus.PAID

    def test_instalments_summing_to_the_total_are_paid(self):
        payments = [make_payment("400"), make_payment("600")]
        assert derive_status(make_invoice("1000"), payments) is InvoiceStatus.PAID

    def test_discount_reduces_what_must_be_paid(self):
        invoice = make_invoice("1000", "200")
        assert derive_status(invoice, [make_payment("800")]) is InvoiceStatus.PAID

    def test_full_refund_is_refunded_not_due(self):
        """A paid-then-refunded invoice nets to zero. Reporting it as "due"
        would hide that money ever moved."""
        payments = [make_payment("1000"), make_payment("-1000")]
        assert derive_status(make_invoice("1000"), payments) is InvoiceStatus.REFUNDED

    def test_partial_refund_leaves_it_partial(self):
        payments = [make_payment("1000"), make_payment("-300")]
        assert derive_status(make_invoice("1000"), payments) is InvoiceStatus.PARTIAL

    def test_refund_of_a_part_payment_is_refunded(self):
        payments = [make_payment("400"), make_payment("-400")]
        assert derive_status(make_invoice("1000"), payments) is InvoiceStatus.REFUNDED


class TestBalance:
    def test_amount_less_discount_less_payments(self):
        invoice = make_invoice("1000", "200")
        assert balance_due(invoice, [make_payment("500")]) == Decimal("300.00")

    def test_settled_invoice_has_no_balance(self):
        assert balance_due(make_invoice("1000"), [make_payment("1000")]) == Decimal("0.00")

    def test_a_refund_restores_the_balance(self):
        payments = [make_payment("1000"), make_payment("-400")]
        assert balance_due(make_invoice("1000"), payments) == Decimal("400.00")

    def test_decimal_arithmetic_is_exact(self):
        """0.10 has no exact binary representation; Decimal is why this holds."""
        payments = [make_payment("0.10")] * 3
        assert total_paid(payments) == Decimal("0.30")
        assert balance_due(make_invoice("1.00"), payments) == Decimal("0.70")

    def test_payable_is_net_of_discount(self):
        assert payable(make_invoice("1000", "250")) == Decimal("750.00")


class TestValidatePayment:
    def test_a_payment_within_the_balance_is_allowed(self):
        assert validate_payment(make_invoice("1000"), [], Decimal("400")) is None

    def test_paying_the_exact_balance_is_allowed(self):
        assert validate_payment(make_invoice("1000"), [], Decimal("1000")) is None

    def test_overpayment_is_refused(self):
        error = validate_payment(make_invoice("1000"), [], Decimal("1500"))
        assert error and "exceeds the outstanding balance" in error

    def test_overpayment_after_a_part_payment_is_refused(self):
        error = validate_payment(make_invoice("1000"), [make_payment("800")], Decimal("300"))
        assert error and "exceeds" in error

    def test_paying_a_settled_invoice_is_refused(self):
        error = validate_payment(make_invoice("1000"), [make_payment("1000")], Decimal("50"))
        assert error and "already settled" in error

    def test_the_ceiling_accounts_for_the_discount(self):
        error = validate_payment(make_invoice("1000", "200"), [], Decimal("900"))
        assert error and "exceeds" in error

    def test_a_refund_within_what_was_received_is_allowed(self):
        assert validate_payment(make_invoice("1000"), [make_payment("500")], Decimal("-300")) is None

    def test_refunding_more_than_was_received_is_refused(self):
        error = validate_payment(make_invoice("1000"), [make_payment("500")], Decimal("-800"))
        assert error and "exceeds the 500.00 received" in error

    def test_refunding_with_nothing_received_is_refused(self):
        error = validate_payment(make_invoice("1000"), [], Decimal("-100"))
        assert error and "received" in error

    def test_a_zero_amount_is_refused(self):
        error = validate_payment(make_invoice("1000"), [], Decimal("0"))
        assert error and "non-zero" in error


class TestPaymentsThroughTheApi:
    """The cache (`status`, `paid_amount`) must stay in step with the ledger."""

    def test_recording_a_payment_updates_the_cached_fields(self, auth_client, invoice):
        response = auth_client.post(
            f"/invoices/{invoice.id}/payments",
            json={"date": TODAY.isoformat(), "amount": "400.00", "method": "cash"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "partial"
        assert body["paid_amount"] == "400.00"
        assert body["net_due"] == "600.00"

    def test_settling_an_invoice_marks_it_paid(self, auth_client, invoice):
        auth_client.post(
            f"/invoices/{invoice.id}/payments",
            json={"date": TODAY.isoformat(), "amount": "1000.00", "method": "cash"},
        )
        assert auth_client.get(f"/invoices/{invoice.id}").json()["status"] == "paid"

    def test_the_api_refuses_an_overpayment(self, auth_client, invoice):
        response = auth_client.post(
            f"/invoices/{invoice.id}/payments",
            json={"date": TODAY.isoformat(), "amount": "5000.00", "method": "cash"},
        )
        assert response.status_code == 409

    def test_a_client_cannot_set_the_status_directly(self, auth_client, patient):
        response = auth_client.post(
            "/invoices",
            json={
                "patient_id": patient.id,
                "service": "Session",
                "date": TODAY.isoformat(),
                "amount": "100.00",
                "status": "paid",
            },
        )
        assert response.status_code == 422

    @pytest.mark.parametrize("discount", ["200.00", "0.00"])
    def test_discount_within_the_amount_is_accepted(self, auth_client, patient, discount):
        response = auth_client.post(
            "/invoices",
            json={
                "patient_id": patient.id,
                "service": "Session",
                "date": TODAY.isoformat(),
                "amount": "1000.00",
                "discount": discount,
            },
        )
        assert response.status_code == 201

    def test_a_discount_above_the_amount_is_rejected(self, auth_client, patient):
        response = auth_client.post(
            "/invoices",
            json={
                "patient_id": patient.id,
                "service": "Session",
                "date": TODAY.isoformat(),
                "amount": "100.00",
                "discount": "200.00",
            },
        )
        assert response.status_code == 422
