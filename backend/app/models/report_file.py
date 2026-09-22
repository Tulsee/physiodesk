"""Uploaded patient documents (scans, referrals, lab reports)."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.patient import Patient


class ReportFile(Base):
    """Metadata for one uploaded file; the bytes live on disk under UPLOAD_DIR.

    Storing a path rather than the blob keeps the database small and makes
    swapping to S3 later a change to one helper.
    """

    __tablename__ = "report_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    uploaded_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    patient: Mapped[Patient] = relationship(back_populates="reports")

    def __repr__(self) -> str:
        return f"<ReportFile {self.id} {self.filename}>"
