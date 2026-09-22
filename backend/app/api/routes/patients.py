"""Patient CRUD with server-side search, filtering and pagination."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import Patient, Therapist
from app.models.enums import PatientStatus
from app.schemas.common import Page
from app.schemas.patient import PatientCreate, PatientDetail, PatientRead, PatientUpdate

router = APIRouter(prefix="/patients", tags=["patients"])


def _get_or_404(db: DbSession, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Patient {patient_id} not found."
        )
    return patient


def _check_therapist(db: DbSession, therapist_id: int | None) -> None:
    """A bad therapist_id should be a clear 422, not an opaque FK violation."""
    if therapist_id is not None and db.get(Therapist, therapist_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Therapist {therapist_id} does not exist.",
        )


@router.get("", response_model=Page[PatientRead], summary="List patients")
def list_patients(
    db: DbSession,
    _: CurrentUser,
    pg: PaginationDep,
    search: Annotated[
        str | None, Query(description="Matches name, phone or condition.")
    ] = None,
    therapist_id: Annotated[int | None, Query()] = None,
    status_filter: Annotated[
        PatientStatus | None,
        Query(alias="status", description="Filter by patient status."),
    ] = None,
) -> Page[PatientRead]:
    stmt = select(Patient)

    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Patient.name.ilike(term),
                Patient.phone.ilike(term),
                Patient.condition.ilike(term),
            )
        )
    if therapist_id is not None:
        stmt = stmt.where(Patient.therapist_id == therapist_id)
    if status_filter is not None:
        stmt = stmt.where(Patient.status == status_filter)

    stmt = stmt.order_by(Patient.name)
    rows, total = paginate(db, stmt, pg)
    return Page[PatientRead].build(
        [PatientRead.model_validate(r) for r in rows], total, pg.page, pg.page_size
    )


@router.get("/{patient_id}", response_model=PatientDetail, summary="Get one patient")
def get_patient(patient_id: int, db: DbSession, _: CurrentUser) -> PatientDetail:
    """Inlines the therapist so the profile header renders in one request."""
    patient = db.execute(
        select(Patient)
        .options(selectinload(Patient.therapist))
        .where(Patient.id == patient_id)
    ).scalar_one_or_none()
    if patient is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Patient {patient_id} not found."
        )
    return PatientDetail.model_validate(patient)


@router.post(
    "",
    response_model=PatientRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create",
)
def create_patient(
    payload: PatientCreate, db: DbSession, _: CurrentUser
) -> PatientRead:
    _check_therapist(db, payload.therapist_id)
    patient = Patient(**payload.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return PatientRead.model_validate(patient)


@router.patch("/{patient_id}", response_model=PatientRead, summary="Update")
def update_patient(
    patient_id: int, payload: PatientUpdate, db: DbSession, _: CurrentUser
) -> PatientRead:
    patient = _get_or_404(db, patient_id)
    data = payload.model_dump(exclude_unset=True)

    if "therapist_id" in data:
        _check_therapist(db, data["therapist_id"])

    used = data.get("sessions_used", patient.sessions_used)
    total = data.get("sessions_total", patient.sessions_total)
    if total is not None and used > total:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"sessions_used ({used}) cannot exceed sessions_total ({total}).",
        )

    for field, value in data.items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)
    return PatientRead.model_validate(patient)


@router.delete(
    "/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete"
)
def delete_patient(patient_id: int, db: DbSession, _: CurrentUser) -> None:
    """Removes the patient and their whole record trail.

    Appointments, notes, reports, invoices and notifications all cascade: none
    of them mean anything without the patient they belong to.
    """
    patient = _get_or_404(db, patient_id)
    db.delete(patient)
    db.commit()
