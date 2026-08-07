from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin, require_student
from app.models.base import NotFoundException
from app.schemas.modules import FeedbackCreate
from app.utils.helpers import clean_text, paginate, serialize

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


@router.post("", status_code=201, summary="Submit feedback (student)")
async def create(payload: FeedbackCreate, current_user=Depends(require_student())):
    db = get_db()
    doc = {
        "user_id": ObjectId(current_user["user_id"]),
        "user_name": current_user.get("name"),
        "rating": payload.rating,
        "message": clean_text(payload.message),
        "category": clean_text(payload.category) if payload.category else None,
        "status": "new",
        "created_at": datetime.utcnow(),
    }
    result = await db.feedback.insert_one(doc)
    return serialize(await db.feedback.find_one({"_id": result.inserted_id}))


@router.get("", summary="List feedback (admin)")
async def list_feedback(page: int = 1, page_size: int = 20, status: str | None = None, admin=Depends(require_admin())):
    db = get_db()
    query = {"status": status} if status else {}
    return await paginate(db.feedback, query, page, page_size, [("created_at", -1)])


@router.patch("/{feedback_id}", summary="Update feedback status (admin)")
async def update_status(feedback_id: str, status: str, admin=Depends(require_admin())):
    db = get_db()
    result = await db.feedback.update_one({"_id": ObjectId(feedback_id)}, {"$set": {"status": status}})
    if result.matched_count == 0:
        raise NotFoundException("Feedback not found")
    return {"success": True, "detail": "Status updated"}
