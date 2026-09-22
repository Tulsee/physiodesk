"""Therapist CRUD, search, and per-date schedule overrides."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import Patient, ScheduleException, Therapist
from app.schemas.common import Page
from app.schemas.therapist import (
    ScheduleExceptionCreate,
    ScheduleExceptionRead,
    TherapistCreate,
    TherapistRead,
    TherapistUpdate,
)

router = APIRouter(prefix="/therapists", tags=["therapists"])


def _get_or_404(db: DbSession, therapist_id: int) -> Therapist:
    therapist = db.get(Therapist, therapist_id)
    if therapist is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Therapist {therapist_id} not found."
        )
    return therapist


@router.get("", response_model=Page[TherapistRead], summary="List therapists")
def list_therapists(
    db: DbSession,
    _: CurrentUser,
    pg: PaginationDep,
    search: Annotated[
        str | None, Query(description="Matches name or specialty.")
    ] = None,
    specialty: Annotated[
        str | None, Query(description="Exact specialty match.")
    ] = None,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[TherapistRead]:
    """Filtering is server-side: the client never receives rows it then hides."""
    stmt = select(Therapist)

    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(Therapist.name.ilike(term) | Therapist.specialty.ilike(term))
    if specialty:
        stmt = stmt.where(func.lower(Therapist.specialty) == specialty.strip().lower())
    if is_active is not None:
        stmt = stmt.where(Therapist.is_active.is_(is_active))

    stmt = stmt.order_by(Therapist.name)
    rows, total = paginate(db, stmt, pg)
    return Page[TherapistRead].build(
        [TherapistRead.model_validate(r) for r in rows], total, pg.page, pg.page_size
    )


@router.get("/specialties", response_model=list[str], summary="Distinct specialties")
def list_specialties(db: DbSession, _: CurrentUser) -> list[str]:
    """Populates the specialty filter without the client scanning every therapist."""
    return list(
        db.execute(select(Therapist.specialty).distinct().order_by(Therapist.specialty))
        .scalars()
        .all()
    )


@router.get(
    "/{therapist_id}", response_model=TherapistRead, summary="Get one therapist"
)
def get_therapist(therapist_id: int, db: DbSession, _: CurrentUser) -> TherapistRead:
    return TherapistRead.model_validate(_get_or_404(db, therapist_id))


@router.post(
    "",
    response_model=TherapistRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create",
)
def create_therapist(
    payload: TherapistCreate, db: DbSession, _: CurrentUser
) -> TherapistRead:
    therapist = Therapist(**payload.model_dump())
    db.add(therapist)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # email is the only unique column on this table.
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A therapist with that email already exists."
        ) from None
    db.refresh(therapist)
    return TherapistRead.model_validate(therapist)


@router.patch("/{therapist_id}", response_model=TherapistRead, summary="Update")
def update_therapist(
    therapist_id: int, payload: TherapistUpdate, db: DbSession, _: CurrentUser
) -> TherapistRead:
    therapist = _get_or_404(db, therapist_id)
    data = payload.model_dump(exclude_unset=True)

    start = data.get("start_time", therapist.start_time)
    end = data.get("end_time", therapist.end_time)
    if end <= start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "end_time must be after start_time."
        )

    for field, value in data.items():
        setattr(therapist, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A therapist with that email already exists."
        ) from None
    db.refresh(therapist)
    return TherapistRead.model_validate(therapist)


@router.delete(
    "/{therapist_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete"
)
def delete_therapist(therapist_id: int, db: DbSession, _: CurrentUser) -> None:
    """Refuses while patients are still assigned.

    Deleting would silently unassign them (the FK is ON DELETE SET NULL), so the
    caller is told to reassign first. Deactivating is usually the real intent.
    """
    therapist = _get_or_404(db, therapist_id)

    assigned = db.execute(
        select(func.count())
        .select_from(Patient)
        .where(Patient.therapist_id == therapist_id)
    ).scalar_one()
    if assigned:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {assigned} patient(s) are assigned to this therapist. "
            "Reassign them first, or deactivate the therapist instead.",
        )

    try:
        db.delete(therapist)
        db.commit()
    except IntegrityError:
        db.rollback()
        # appointments.therapist_id is ON DELETE RESTRICT.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete: this therapist has appointments on record.",
        ) from None


# --------------------------------------------------------------------------
# Per-date working-hour overrides
# --------------------------------------------------------------------------


@router.get(
    "/{therapist_id}/schedule-exceptions",
    response_model=list[ScheduleExceptionRead],
    summary="List schedule overrides",
)
def list_schedule_exceptions(
    therapist_id: int, db: DbSession, _: CurrentUser
) -> list[ScheduleExceptionRead]:
    _get_or_404(db, therapist_id)
    rows = (
        db.execute(
            select(ScheduleException)
            .where(ScheduleException.therapist_id == therapist_id)
            .order_by(ScheduleException.date)
        )
        .scalars()
        .all()
    )
    return [ScheduleExceptionRead.model_validate(r) for r in rows]


@router.post(
    "/{therapist_id}/schedule-exceptions",
    response_model=ScheduleExceptionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add or replace a schedule override",
)
def upsert_schedule_exception(
    therapist_id: int, payload: ScheduleExceptionCreate, db: DbSession, _: CurrentUser
) -> ScheduleExceptionRead:
    """Upsert rather than insert: there is one override per therapist-date, so
    posting the same date twice edits it instead of failing the unique constraint."""
    _get_or_404(db, therapist_id)

    existing = db.execute(
        select(ScheduleException).where(
            ScheduleException.therapist_id == therapist_id,
            ScheduleException.date == payload.date,
        )
    ).scalar_one_or_none()

    if existing:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        row = existing
    else:
        row = ScheduleException(therapist_id=therapist_id, **payload.model_dump())
        db.add(row)

    db.commit()
    db.refresh(row)
    return ScheduleExceptionRead.model_validate(row)


@router.delete(
    "/{therapist_id}/schedule-exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a schedule override",
)
def delete_schedule_exception(
    therapist_id: int, exception_id: int, db: DbSession, _: CurrentUser
) -> None:
    row = db.get(ScheduleException, exception_id)
    if row is None or row.therapist_id != therapist_id:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Override {exception_id} not found."
        )
    db.delete(row)
    db.commit()
