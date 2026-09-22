"""Uploaded document metadata."""

import datetime as dt

from app.schemas.common import ORMModel


class ReportFileRead(ORMModel):
    id: int
    patient_id: int
    filename: str
    content_type: str | None
    size: int
    uploaded_at: dt.datetime
