"""Notification CRUD and the send/cancel actions."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import Notification, Patient
from app.models.enums import NotificationChannel, NotificationStatus, NotificationType
from app.schemas.common import Page
from app.schemas.notification import (
    NotificationCreate,
    NotificationDetail,
    NotificationUpdate,
)
from app.services import notifications as svc

router = APIRouter(prefix="/notifications", tags=["notifications"])

EDITABLE_STATUSES = (NotificationStatus.SCHEDULED, NotificationStatus.FAILED)


def _get_or_404(db: DbSession, notification_id: int) -> Notification:
    row = db.execute(
        select(Notification)
        .options(selectinload(Notification.patient))
        .where(Notification.id == notification_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Notification {notification_id} not found."
        )
    return row


def _detail(row: Notification) -> NotificationDetail:
    d = NotificationDetail.model_validate(row)
    d.patient_name = row.patient.name if row.patient else None
    return d


@router.get("", response_model=Page[NotificationDetail], summary="List notifications")
def list_notifications(
    db: DbSession,
    _: CurrentUser,
    pg: PaginationDep,
    patient_id: Annotated[int | None, Query()] = None,
    type_filter: Annotated[NotificationType | None, Query(alias="type")] = None,
    channel: Annotated[NotificationChannel | None, Query()] = None,
    status_filter: Annotated[NotificationStatus | None, Query(alias="status")] = None,
) -> Page[NotificationDetail]:
    stmt = select(Notification).options(selectinload(Notification.patient))

    if patient_id is not None:
        stmt = stmt.where(Notification.patient_id == patient_id)
    if type_filter is not None:
        stmt = stmt.where(Notification.type == type_filter)
    if channel is not None:
        stmt = stmt.where(Notification.channel == channel)
    if status_filter is not None:
        stmt = stmt.where(Notification.status == status_filter)

    # Soonest-scheduled first: the queue reads as what happens next.
    stmt = stmt.order_by(Notification.scheduled_for.desc(), Notification.id.desc())
    rows, total = paginate(db, stmt, pg)
    return Page[NotificationDetail].build(
        [_detail(r) for r in rows], total, pg.page, pg.page_size
    )


@router.get("/{notification_id}", response_model=NotificationDetail, summary="Get one")
def get_notification(
    notification_id: int, db: DbSession, _: CurrentUser
) -> NotificationDetail:
    return _detail(_get_or_404(db, notification_id))


@router.post(
    "",
    response_model=NotificationDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a notification",
)
def create_notification(
    payload: NotificationCreate, db: DbSession, _: CurrentUser
) -> NotificationDetail:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Patient {payload.patient_id} does not exist.",
        )
    row = Notification(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _detail(row)


@router.patch("/{notification_id}", response_model=NotificationDetail, summary="Update")
def update_notification(
    notification_id: int, payload: NotificationUpdate, db: DbSession, _: CurrentUser
) -> NotificationDetail:
    row = _get_or_404(db, notification_id)
    if row.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot edit a notification that is already {row.status.value}.",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _detail(row)


@router.post(
    "/{notification_id}/send", response_model=NotificationDetail, summary="Send now"
)
def send_notification(
    notification_id: int, db: DbSession, _: CurrentUser
) -> NotificationDetail:
    """Hands the notification to the configured sender and records the outcome.

    A failure is stored with its reason rather than raised: the front desk needs
    to see which messages did not go out and why.
    """
    row = _get_or_404(db, notification_id)

    if row.status is NotificationStatus.SENT:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This notification was already sent."
        )
    if row.status is NotificationStatus.CANCELLED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This notification was cancelled."
        )

    result = svc.get_sender().send(row, svc.recipient_for(row))

    if result.ok:
        row.status = NotificationStatus.SENT
        row.sent_at = dt.datetime.now(dt.UTC)
        row.failure_reason = None
    else:
        row.status = NotificationStatus.FAILED
        row.failure_reason = result.error

    db.commit()
    db.refresh(row)
    return _detail(row)


@router.post(
    "/{notification_id}/cancel", response_model=NotificationDetail, summary="Cancel"
)
def cancel_notification(
    notification_id: int, db: DbSession, _: CurrentUser
) -> NotificationDetail:
    row = _get_or_404(db, notification_id)
    if row.status is NotificationStatus.SENT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot cancel a notification that was already sent.",
        )
    row.status = NotificationStatus.CANCELLED
    db.commit()
    db.refresh(row)
    return _detail(row)


@router.delete(
    "/{notification_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete"
)
def delete_notification(notification_id: int, db: DbSession, _: CurrentUser) -> None:
    db.delete(_get_or_404(db, notification_id))
    db.commit()
