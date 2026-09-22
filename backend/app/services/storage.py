"""Local file storage for patient report uploads.

Everything that touches the filesystem lives here, so swapping to S3 later means
reimplementing three functions rather than editing the routes.
"""

import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

CHUNK_SIZE = 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class UploadTooLarge(Exception):
    def __init__(self, limit_mb: int) -> None:
        super().__init__(f"File exceeds the {limit_mb} MB limit.")
        self.limit_mb = limit_mb


class UnsupportedFileType(Exception):
    def __init__(self, content_type: str | None) -> None:
        super().__init__(f"Unsupported file type: {content_type or 'unknown'}.")
        self.content_type = content_type


def sanitize_filename(name: str) -> str:
    """Reduce a client-supplied name to something safe to display and store.

    Strips any directory component first: a browser can send
    "../../etc/passwd" as the filename, and only the basename is meaningful.
    """
    base = Path(name).name
    cleaned = _SAFE_NAME.sub("_", base).strip("._") or "upload"
    return cleaned[:255]


def _generate_storage_name(original: str) -> str:
    """A collision-proof name, so two patients uploading "scan.pdf" coexist."""
    suffix = Path(sanitize_filename(original)).suffix.lower()[:16]
    return f"{uuid.uuid4().hex}{suffix}"


async def save_upload(upload: UploadFile, patient_id: int) -> tuple[str, int]:
    """Write the upload to disk. Returns (storage_path, size_in_bytes).

    The storage path is stored relative to UPLOAD_DIR so the database stays
    portable across machines and deployments.
    """
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise UnsupportedFileType(upload.content_type)

    patient_dir = settings.upload_path / f"patient_{patient_id}"
    patient_dir.mkdir(parents=True, exist_ok=True)

    storage_name = _generate_storage_name(upload.filename or "upload")
    destination = patient_dir / storage_name

    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    try:
        with destination.open("wb") as fh:
            while chunk := await upload.read(CHUNK_SIZE):
                size += len(chunk)
                if size > limit:
                    raise UploadTooLarge(settings.max_upload_mb)
                fh.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return f"patient_{patient_id}/{storage_name}", size


def absolute_path(storage_path: str) -> Path:
    """Resolve a stored relative path, refusing anything outside UPLOAD_DIR."""
    root = settings.upload_path.resolve()
    resolved = (root / storage_path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(
            f"Refusing to serve a path outside the upload directory: {storage_path}"
        )
    return resolved


def delete_file(storage_path: str) -> None:
    """Remove a stored file. Missing is fine — the goal is that it is gone."""
    try:
        absolute_path(storage_path).unlink(missing_ok=True)
    except ValueError:
        pass
