"""Patient report files: upload, list, download, delete."""

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import Patient, ReportFile
from app.schemas.report_file import ReportFileRead
from app.services import storage

router = APIRouter(tags=["reports"])


def _patient_or_404(db: DbSession, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Patient {patient_id} not found."
        )
    return patient


@router.get(
    "/patients/{patient_id}/reports",
    response_model=list[ReportFileRead],
    summary="List a patient's documents",
)
def list_reports(
    patient_id: int, db: DbSession, _: CurrentUser
) -> list[ReportFileRead]:
    _patient_or_404(db, patient_id)
    rows = (
        db.execute(
            select(ReportFile)
            .where(ReportFile.patient_id == patient_id)
            .order_by(ReportFile.uploaded_at.desc())
        )
        .scalars()
        .all()
    )
    return [ReportFileRead.model_validate(r) for r in rows]


@router.post(
    "/patients/{patient_id}/reports",
    response_model=ReportFileRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document",
)
async def upload_report(
    patient_id: int, db: DbSession, _: CurrentUser, file: UploadFile = File(...)
) -> ReportFileRead:
    _patient_or_404(db, patient_id)

    try:
        storage_path, size = await storage.save_upload(file, patient_id)
    except storage.UnsupportedFileType as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from None
    except storage.UploadTooLarge as exc:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)
        ) from None

    row = ReportFile(
        patient_id=patient_id,
        filename=storage.sanitize_filename(file.filename or "upload"),
        storage_path=storage_path,
        content_type=file.content_type,
        size=size,
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_file(storage_path)
        raise
    db.refresh(row)
    return ReportFileRead.model_validate(row)


@router.get("/reports/{report_id}/download", summary="Download a document")
def download_report(report_id: int, db: DbSession, _: CurrentUser) -> FileResponse:
    row = db.get(ReportFile, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Report {report_id} not found.")

    path = storage.absolute_path(row.storage_path)
    if not path.is_file():
        raise HTTPException(
            status.HTTP_410_GONE,
            "The stored file for this report is no longer on disk.",
        )

    return FileResponse(
        path,
        media_type=row.content_type or "application/octet-stream",
        filename=row.filename,
    )


@router.delete(
    "/reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
def delete_report(report_id: int, db: DbSession, _: CurrentUser) -> None:
    row = db.get(ReportFile, report_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Report {report_id} not found.")

    storage_path = row.storage_path
    db.delete(row)
    db.commit()
    storage.delete_file(storage_path)
