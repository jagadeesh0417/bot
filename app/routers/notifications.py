from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.base import NotFoundException
from app.utils.helpers import paginate, serialize

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("", summary="My notifications")
async def my_notifications(page: int = 1, page_size: int = 20, unread_only: bool = False, current_user=Depends(get_current_user)):
    db = get_db()
    query: dict = {"user_id": ObjectId(current_user["user_id"])}
    if unread_only:
        query["read"] = False
    return await paginate(db.notifications, query, page, page_size, [("created_at", -1)])


@router.get("/unread-count", summary="Unread notification count")
async def unread_count(current_user=Depends(get_current_user)):
    db = get_db()
    count = await db.notifications.count_documents({"user_id": ObjectId(current_user["user_id"]), "read": False})
    return {"count": count}


@router.patch("/{notification_id}/read", summary="Mark notification as read")
async def mark_read(notification_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": ObjectId(current_user["user_id"])},
        {"$set": {"read": True}},
    )
    return {"success": True}


@router.post("/mark-all-read", summary="Mark all notifications as read")
async def mark_all_read(current_user=Depends(get_current_user)):
    db = get_db()
    await db.notifications.update_many(
        {"user_id": ObjectId(current_user["user_id"]), "read": False},
        {"$set": {"read": True}},
    )
    return {"success": True}


@router.post("/broadcast", summary="Broadcast notification to all students (admin)", dependencies=[Depends(require_admin())])
async def broadcast(title: str, message: str):
    from datetime import datetime

    from app.database.mongo import get_db

    db = get_db()
    students = [s async for s in db.students.find({}, {"user_id": 1})]
    docs = [
        {
            "user_id": s["user_id"],
            "title": title[:150],
            "message": message[:1000],
            "type": "broadcast",
            "read": False,
            "link": None,
            "created_at": datetime.utcnow(),
        }
        for s in students
        if s.get("user_id")
    ]
    if docs:
        await db.notifications.insert_many(docs)
    return {"success": True, "detail": f"Broadcast to {len(docs)} students"}
