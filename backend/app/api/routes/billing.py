"""Invoices, payments, refunds and receipts."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import Invoice, Patient, Payment
from app.models.enums import InvoiceStatus
from app.schemas.billing import (
    InvoiceCreate,
    InvoiceDetail,
    InvoiceRead,
    InvoiceUpdate,
    PaymentCreate,
    PaymentRead,
    Receipt,
)
from app.schemas.common import Page
from app.services import billing

router = APIRouter(tags=["billing"])


def _invoice_or_404(db: DbSession, invoice_id: int) -> Invoice:
    invoice = db.execute(
        select(Invoice)
        .options(selectinload(Invoice.payments), selectinload(Invoice.patient))
        .where(Invoice.id == invoice_id)
    ).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Invoice {invoice_id} not found."
        )
    return invoice


def _detail(invoice: Invoice) -> InvoiceDetail:
    d = InvoiceDetail.model_validate(invoice)
    d.patient_name = invoice.patient.name if invoice.patient else None
    return d


@router.get("/invoices", response_model=Page[InvoiceRead], summary="List invoices")
def list_invoices(
    db: DbSession,
    _: CurrentUser,
    pg: PaginationDep,
    patient_id: Annotated[int | None, Query()] = None,
    status_filter: Annotated[InvoiceStatus | None, Query(alias="status")] = None,
    date_from: Annotated[dt.date | None, Query()] = None,
    date_to: Annotated[dt.date | None, Query()] = None,
) -> Page[InvoiceRead]:
    stmt = select(Invoice)

    if patient_id is not None:
        stmt = stmt.where(Invoice.patient_id == patient_id)
    if status_filter is not None:
        # Filtering on the cached column, which is why it is kept correct.
        stmt = stmt.where(Invoice.status == status_filter)
    if date_from is not None:
        stmt = stmt.where(Invoice.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Invoice.date <= date_to)

    stmt = stmt.order_by(Invoice.date.desc(), Invoice.id.desc())
    rows, total = paginate(db, stmt, pg)
    return Page[InvoiceRead].build(
        [InvoiceRead.model_validate(r) for r in rows], total, pg.page, pg.page_size
    )


@router.get(
    "/invoices/{invoice_id}", response_model=InvoiceDetail, summary="Get one invoice"
)
def get_invoice(invoice_id: int, db: DbSession, _: CurrentUser) -> InvoiceDetail:
    return _detail(_invoice_or_404(db, invoice_id))


@router.post(
    "/invoices",
    response_model=InvoiceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an invoice",
)
def create_invoice(
    payload: InvoiceCreate, db: DbSession, _: CurrentUser
) -> InvoiceRead:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Patient {payload.patient_id} does not exist.",
        )

    invoice = Invoice(**payload.model_dump())
    # A new invoice has no payments, so this sets DUE and a zero paid_amount
    # rather than trusting the model defaults.
    billing.recalculate(invoice, payments=[])
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return InvoiceRead.model_validate(invoice)


@router.patch(
    "/invoices/{invoice_id}", response_model=InvoiceDetail, summary="Update an invoice"
)
def update_invoice(
    invoice_id: int, payload: InvoiceUpdate, db: DbSession, _: CurrentUser
) -> InvoiceDetail:
    """Amount and discount can change; status and paid_amount cannot.

    Editing either one changes what is owed, so the status is recomputed from
    the existing payments in the same transaction.
    """
    invoice = _invoice_or_404(db, invoice_id)
    data = payload.model_dump(exclude_unset=True)

    amount = data.get("amount", invoice.amount)
    discount = data.get("discount", invoice.discount)
    if discount > amount:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Discount ({discount}) cannot exceed amount ({amount}).",
        )

    paid = billing.total_paid(invoice.payments)
    if amount - discount < paid:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot reduce the payable total to {amount - discount}: "
            f"{paid} has already been received. Refund the difference first.",
        )

    for field, value in data.items():
        setattr(invoice, field, value)

    billing.recalculate(invoice)
    db.commit()
    db.refresh(invoice)
    return _detail(invoice)


@router.delete(
    "/invoices/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an invoice",
)
def delete_invoice(invoice_id: int, db: DbSession, _: CurrentUser) -> None:
    """Refuses once money has moved: the payments are a financial record."""
    invoice = _invoice_or_404(db, invoice_id)
    if invoice.payments:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: this invoice has {len(invoice.payments)} payment(s) recorded.",
        )
    db.delete(invoice)
    db.commit()


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------


@router.get(
    "/invoices/{invoice_id}/payments",
    response_model=list[PaymentRead],
    summary="Payment history",
)
def list_payments(invoice_id: int, db: DbSession, _: CurrentUser) -> list[PaymentRead]:
    invoice = _invoice_or_404(db, invoice_id)
    return [PaymentRead.model_validate(p) for p in invoice.payments]


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=InvoiceDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Record a payment or refund",
)
def create_payment(
    invoice_id: int, payload: PaymentCreate, db: DbSession, _: CurrentUser
) -> InvoiceDetail:
    """A negative amount is a refund.

    Returns the whole invoice rather than the payment, so the caller sees the
    resulting status and balance without a second request.
    """
    invoice = _invoice_or_404(db, invoice_id)

    error = billing.validate_payment(invoice, list(invoice.payments), payload.amount)
    if error:
        raise HTTPException(status.HTTP_409_CONFLICT, error)

    payment = Payment(invoice_id=invoice.id, **payload.model_dump())
    db.add(payment)
    db.flush()
    db.refresh(invoice)
    billing.recalculate(invoice)
    db.commit()
    db.refresh(invoice)
    return _detail(invoice)


@router.delete(
    "/payments/{payment_id}",
    response_model=InvoiceDetail,
    summary="Remove a payment entry",
)
def delete_payment(payment_id: int, db: DbSession, _: CurrentUser) -> InvoiceDetail:
    """For an entry recorded in error. Corrections should normally be a refund,
    which keeps the audit trail."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Payment {payment_id} not found."
        )

    invoice_id = payment.invoice_id
    db.delete(payment)
    db.flush()

    invoice = _invoice_or_404(db, invoice_id)
    db.refresh(invoice)
    billing.recalculate(invoice)
    db.commit()
    db.refresh(invoice)
    return _detail(invoice)


# ---------------------------------------------------------------------------
# Receipt
# ---------------------------------------------------------------------------


@router.get(
    "/invoices/{invoice_id}/receipt", response_model=Receipt, summary="Receipt data"
)
def get_receipt(invoice_id: int, db: DbSession, _: CurrentUser) -> Receipt:
    """Structured receipt data; the frontend renders the printable view."""
    invoice = _invoice_or_404(db, invoice_id)
    return Receipt(
        invoice_id=invoice.id,
        issued_at=dt.datetime.now(dt.UTC),
        patient_name=invoice.patient.name,
        patient_phone=invoice.patient.phone,
        service=invoice.service,
        date=invoice.date,
        amount=invoice.amount,
        discount=invoice.discount,
        paid_amount=invoice.paid_amount,
        net_due=invoice.net_due,
        status=invoice.status,
        payments=[PaymentRead.model_validate(p) for p in invoice.payments],
    )
