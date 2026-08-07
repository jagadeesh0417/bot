"""Cloudinary service: upload, delete, replace, validate; URLs only in DB."""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import cloudinary
import cloudinary.uploader
import cloudinary.api

from app.config.settings import settings
from app.models.base import BadRequestException
from app.utils.logger import upload_logger

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_PDF_TYPES = {"application/pdf"}
ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 60 * 1024 * 1024


def is_cloudinary_configured() -> bool:
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
        and "your-" not in f"{settings.CLOUDINARY_CLOUD_NAME}{settings.CLOUDINARY_API_KEY}".lower()
    )


def _resource_type(content_type: str, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if content_type in ALLOWED_VIDEO_TYPES or suffix in {".mp4", ".webm", ".mov"}:
        return "video"
    if content_type in ALLOWED_IMAGE_TYPES or suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return "image"
    return "raw"


def _validate_upload(content_type: str, filename: str, size: int, purpose: str) -> str:
    suffix = Path(filename).suffix.lower()
    if purpose == "image":
        if content_type not in ALLOWED_IMAGE_TYPES and suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            raise BadRequestException("Only image files are allowed (jpg, png, webp, gif)")
        if size > MAX_IMAGE_BYTES:
            raise BadRequestException("Image exceeds maximum size of 8 MB")
    elif purpose == "video":
        if content_type not in ALLOWED_VIDEO_TYPES and suffix not in {".mp4", ".webm", ".mov"}:
            raise BadRequestException("Only video files are allowed (mp4, webm, mov)")
        if size > MAX_VIDEO_BYTES:
            raise BadRequestException("Video exceeds maximum size of 60 MB")
    elif purpose == "pdf":
        if content_type != "application/pdf" and suffix != ".pdf":
            raise BadRequestException("Only PDF files are allowed")
        if size > settings.max_upload_bytes:
            raise BadRequestException("File exceeds maximum upload size")
    else:  # document
        if content_type not in ALLOWED_DOC_TYPES and suffix != ".pdf":
            raise BadRequestException("Only PDF or Word documents are allowed")
        if size > settings.max_upload_bytes:
            raise BadRequestException("File exceeds maximum upload size")
    return _resource_type(content_type, filename)


async def upload_file(file_content: bytes, filename: str, content_type: str, purpose: str = "image", folder: str | None = None) -> dict:
    """Upload a file to Cloudinary and return {url, public_id, resource_type}.

    Raises a friendly exception when Cloudinary is not configured.
    """
    if not is_cloudinary_configured():
        upload_logger.warning("Cloudinary not configured; saving to local uploads dir: %s", filename)
        return _save_locally(file_content, filename, content_type, purpose)

    resource_type = _validate_upload(content_type, filename, len(file_content), purpose)
    target_folder = f"{settings.CLOUDINARY_FOLDER}/{folder}" if folder else settings.CLOUDINARY_FOLDER

    try:
        result: dict[str, Any] = cloudinary.uploader.upload(
            io.BytesIO(file_content),
            resource_type=resource_type,
            folder=target_folder,
            public_id=None,
            overwrite=True,
        )
        upload_logger.info("Uploaded %s -> %s", filename, result.get("public_id"))
        return {"url": result["secure_url"], "public_id": result.get("public_id"), "resource_type": resource_type}
    except Exception as exc:
        upload_logger.error("Cloudinary upload failed for %s: %s", filename, exc)
        upload_logger.warning("Falling back to local storage for %s", filename)
        return _save_locally(file_content, filename, content_type, purpose)


def _save_locally(file_content: bytes, filename: str, content_type: str, purpose: str) -> dict:
    import tempfile
    import time

    from app.utils.helpers import clean_text

    safe_name = clean_text(filename).replace(" ", "_") or "file"
    base = Path(settings.UPLOAD_DIR)
    try:
        base.mkdir(parents=True, exist_ok=True)
        test = base / ".write_test"
        test.touch()
        test.unlink()
    except OSError:
        base = Path(tempfile.gettempdir()) / "collegeai_uploads"
        base.mkdir(parents=True, exist_ok=True)
    local_dir = base / purpose
    local_dir.mkdir(parents=True, exist_ok=True)
    path = local_dir / f"{int(time.time() * 1000)}_{safe_name}"
    path.write_bytes(file_content)
    return {"url": f"/uploads/{purpose}/{path.name}", "public_id": f"local:{path.name}", "resource_type": _resource_type(content_type, filename)}


async def delete_file(public_id: str | None, url: str | None = None) -> None:
    if not public_id:
        return
    if public_id.startswith("local:"):
        name = public_id.split(":", 1)[1]
        for purpose_dir in Path(settings.UPLOAD_DIR).glob("*"):
            candidate = purpose_dir / name
            if candidate.exists():
                candidate.unlink(missing_ok=True)
        return
    if not is_cloudinary_configured():
        return
    try:
        result = cloudinary.uploader.destroy(public_id)
        if result.get("result") == "ok":
            upload_logger.info("Deleted Cloudinary asset %s", public_id)
    except Exception as exc:
        upload_logger.error("Cloudinary delete failed for %s: %s", public_id, exc)


async def replace_file(old_public_id: str | None, file_content: bytes, filename: str, content_type: str, purpose: str = "image") -> dict:
    """Upload a new file and delete the previous one."""
    new_asset = await upload_file(file_content, filename, content_type, purpose)
    if old_public_id:
        await delete_file(old_public_id)
    return new_asset
