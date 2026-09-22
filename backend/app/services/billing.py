"""Invoice balance and status arithmetic.

``invoice.status`` and ``invoice.paid_amount`` are a denormalized cache of the
payment rows. They are recomputed here and written inside the same transaction
as every payment, so reads stay a single row lookup and the cache cannot drift.

Every amount is Decimal. Money never touches float.
"""

from decimal import Decimal

from app.models import Invoice, Payment
from app.models.enums import InvoiceStatus

ZERO = Decimal("0.00")


def payable(invoice: Invoice) -> Decimal:
    """What the invoice is worth after discount — the amount actually owed."""
    return invoice.amount - invoice.discount


def total_paid(payments: list[Payment]) -> Decimal:
    """Net of payments and refunds. Refunds are negative, so this is a plain sum."""
    return sum((p.amount for p in payments), ZERO)


def balance_due(invoice: Invoice, payments: list[Payment]) -> Decimal:
    return payable(invoice) - total_paid(payments)


def derive_status(invoice: Invoice, payments: list[Payment]) -> InvoiceStatus:
    """The invoice's status, computed from its payments.

    Order matters. Refunded is checked first: an invoice that was paid and then
    fully refunded has a zero net, which would otherwise read as DUE and hide
    that money moved at all.
    """
    if not payments:
        return InvoiceStatus.DUE

    net = total_paid(payments)
    has_refund = any(p.amount < 0 for p in payments)

    if has_refund and net <= ZERO:
        return InvoiceStatus.REFUNDED

    if net <= ZERO:
        return InvoiceStatus.DUE

    due = payable(invoice)
    if net >= due:
        return InvoiceStatus.PAID

    return InvoiceStatus.PARTIAL


def recalculate(invoice: Invoice, payments: list[Payment] | None = None) -> None:
    """Refresh the cached fields in place. The caller commits.

    Doing this in the caller's transaction is the point: a payment row and the
    status it implies are written together or not at all.
    """
    rows = invoice.payments if payments is None else payments
    invoice.paid_amount = total_paid(rows)
    invoice.status = derive_status(invoice, rows)


def validate_payment(
    invoice: Invoice, payments: list[Payment], amount: Decimal
) -> str | None:
    """Check a proposed payment. Returns an error message, or None if allowed.

    Two rules:
      - a payment cannot exceed what is still owed (no accidental overpayment)
      - a refund cannot exceed what was actually received
    """
    if amount == ZERO:
        return "Payment amount must be non-zero."

    paid = total_paid(payments)

    if amount > ZERO:
        outstanding = payable(invoice) - paid
        if outstanding <= ZERO:
            return (
                f"This invoice is already settled (balance {outstanding:.2f}); "
                "record a refund instead."
            )
        if amount > outstanding:
            return f"Payment of {amount:.2f} exceeds the outstanding balance of {outstanding:.2f}."
        return None

    if -amount > paid:
        return (
            f"Refund of {-amount:.2f} exceeds the {paid:.2f} received on this invoice."
        )
    return None
