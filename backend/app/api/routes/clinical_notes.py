"""Clinical notes, scoped to a patient, plus the progress series derived from them."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, PaginationDep, paginate
from app.models import ClinicalNote, Patient, Therapist
from app.schemas.clinical_note import (
    ClinicalNoteCreate,
    ClinicalNoteRead,
    ClinicalNoteUpdate,
    MilestonePoint,
    ProgressPoint,
    ProgressSeries,
)
from app.schemas.common import Page

router = APIRouter(tags=["clinical notes"])


def _patient_or_404(db: DbSession, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Patient {patient_id} not found."
        )
    return patient


def _note_or_404(db: DbSession, note_id: int) -> ClinicalNote:
    note = db.get(ClinicalNote, note_id)
    if note is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Clinical note {note_id} not found."
        )
    return note


def _check_therapist(db: DbSession, therapist_id: int | None) -> None:
    if therapist_id is not None and db.get(Therapist, therapist_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Therapist {therapist_id} does not exist.",
        )


@router.get(
    "/patients/{patient_id}/clinical-notes",
    response_model=Page[ClinicalNoteRead],
    summary="List a patient's clinical notes",
)
def list_notes(
    patient_id: int, db: DbSession, _: CurrentUser, pg: PaginationDep
) -> Page[ClinicalNoteRead]:
    """Newest first: the most recent session is what a clinician wants to see."""
    _patient_or_404(db, patient_id)
    stmt = (
        select(ClinicalNote)
        .where(ClinicalNote.patient_id == patient_id)
        .order_by(ClinicalNote.date.desc(), ClinicalNote.id.desc())
    )
    rows, total = paginate(db, stmt, pg)
    return Page[ClinicalNoteRead].build(
        [ClinicalNoteRead.model_validate(r) for r in rows], total, pg.page, pg.page_size
    )


@router.post(
    "/patients/{patient_id}/clinical-notes",
    response_model=ClinicalNoteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a clinical note",
)
def create_note(
    patient_id: int, payload: ClinicalNoteCreate, db: DbSession, _: CurrentUser
) -> ClinicalNoteRead:
    patient = _patient_or_404(db, patient_id)
    _check_therapist(db, payload.therapist_id)

    data = payload.model_dump()
    if data.get("therapist_id") is None:
        data["therapist_id"] = patient.therapist_id

    note = ClinicalNote(patient_id=patient_id, **data)
    db.add(note)
    db.commit()
    db.refresh(note)
    return ClinicalNoteRead.model_validate(note)


@router.get(
    "/clinical-notes/{note_id}", response_model=ClinicalNoteRead, summary="Get one note"
)
def get_note(note_id: int, db: DbSession, _: CurrentUser) -> ClinicalNoteRead:
    return ClinicalNoteRead.model_validate(_note_or_404(db, note_id))


@router.patch(
    "/clinical-notes/{note_id}", response_model=ClinicalNoteRead, summary="Update"
)
def update_note(
    note_id: int, payload: ClinicalNoteUpdate, db: DbSession, _: CurrentUser
) -> ClinicalNoteRead:
    note = _note_or_404(db, note_id)
    data = payload.model_dump(exclude_unset=True)
    if "therapist_id" in data:
        _check_therapist(db, data["therapist_id"])
    for field, value in data.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return ClinicalNoteRead.model_validate(note)


@router.delete(
    "/clinical-notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete",
)
def delete_note(note_id: int, db: DbSession, _: CurrentUser) -> None:
    db.delete(_note_or_404(db, note_id))
    db.commit()


@router.get(
    "/patients/{patient_id}/progress",
    response_model=ProgressSeries,
    summary="Progress series derived from clinical notes",
)
def get_progress(patient_id: int, db: DbSession, _: CurrentUser) -> ProgressSeries:
    """Projects the notes into three chart series plus a milestone timeline.

    Nothing here is stored: the charts cannot drift from the notes because they
    are the same rows read a different way. Notes with a null score simply do
    not contribute a point to that series.
    """
    _patient_or_404(db, patient_id)

    notes = (
        db.execute(
            select(ClinicalNote)
            .where(ClinicalNote.patient_id == patient_id)
            .order_by(ClinicalNote.date, ClinicalNote.id)
        )
        .scalars()
        .all()
    )

    return ProgressSeries(
        patient_id=patient_id,
        pain=[
            ProgressPoint(date=n.date, value=n.pain_score)
            for n in notes
            if n.pain_score is not None
        ],
        rom=[
            ProgressPoint(date=n.date, value=n.rom_score)
            for n in notes
            if n.rom_score is not None
        ],
        strength=[
            ProgressPoint(date=n.date, value=n.strength_score)
            for n in notes
            if n.strength_score is not None
        ],
        milestones=[
            MilestonePoint(date=n.date, milestone=n.milestone)
            for n in notes
            if n.milestone
        ],
    )
