from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, Request

from app.cloudinary.client import delete_file, upload_file
from app.database.mongo import get_db
from app.middleware.auth import get_current_user, require_admin, require_student
from app.models.base import BadRequestException, NotFoundException
from app.utils.helpers import clean_text

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

PURPOSES = {"image", "video", "pdf", "document"}


async def _read_form(request: Request) -> tuple:
    form = await request.form()
    file = form.get("file")
    purpose = str(form.get("purpose") or "image")
    if not file:
        raise BadRequestException("No file provided")
    if purpose not in PURPOSES:
        raise BadRequestException("Invalid purpose. Allowed: image, video, pdf, document")
    content = await file.read()
    return content, file.filename or "file", file.content_type or "application/octet-stream", purpose


@router.post("", summary="Upload a file to Cloudinary (authenticated)")
async def upload(request: Request, current_user=Depends(get_current_user)):
    content, filename, content_type, purpose = await _read_form(request)
    asset = await upload_file(content, filename, content_type, purpose)
    return {"success": True, "url": asset["url"], "public_id": asset["public_id"], "resource_type": asset["resource_type"]}


@router.delete("/{public_id}", summary="Delete a file from Cloudinary (admin)")
async def remove(public_id: str, admin=Depends(require_admin())):
    await delete_file(public_id)
    return {"success": True, "detail": "File deleted"}
