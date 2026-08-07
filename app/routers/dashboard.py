from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin

router = APIRouter(prefix="/api/dashboard", tags=["Admin Dashboard"])


@router.get("/stats", summary="Dashboard statistics")
async def stats(admin=Depends(require_admin())):
    db = get_db()
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    return {
        "students": await db.students.count_documents({}),
        "faculty": await db.faculty.count_documents({}),
        "courses": await db.courses.count_documents({}),
        "departments": await db.departments.count_documents({}),
        "pdfs": await db.knowledge_base.count_documents({}),
        "notices": await db.notices.count_documents({}),
        "chats": await db.chat_history.count_documents({}),
        "events": await db.events.count_documents({}),
        "placements": await db.placements.count_documents({}),
        "gallery": await db.gallery.count_documents({}),
        "feedback": await db.feedback.count_documents({}),
        "active_today": await db.user_sessions.count_documents({"created_at": {"$gte": week_ago}}),
    }


@router.get("/analytics", summary="Chart data")
async def analytics(admin=Depends(require_admin())):
    db = get_db()
    now = datetime.utcnow()

    async def series_days(collection: str, days: int = 14) -> list[int]:
        start = now - timedelta(days=days - 1)
        counts = []
        for i in range(days):
            day_start = datetime(start.year, start.month, start.day) + timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            counts.append(await db[collection].count_documents({"created_at": {"$gte": day_start, "$lt": day_end}}))
        return counts

    departments = [serialize_d(d) async for d in db.departments.find().sort("name", 1)]

    def serialize_d(doc):
        return {"name": doc.get("name"), "students": 0, "faculty": 0}

    student_by_dept = []
    for dept in departments:
        dept_id = dept["_id"] if "_id" in dept else None
        student_by_dept.append(
            {
                "name": dept["name"],
                "students": await db.students.count_documents({"department_id": dept_id}),
                "faculty": await db.faculty.count_documents({"department_id": dept_id}),
            }
        )

    notices_by_priority = []
    for priority in ("urgent", "important", "normal"):
        notices_by_priority.append(
            {"name": priority, "count": await db.notices.count_documents({"priority": priority})}
        )

    recent_chats = [
        serialize_chat(c)
        async for c in db.chat_history.find().sort("created_at", -1).limit(10)
    ]

    def serialize_chat(doc):
        return {
            "id": str(doc["_id"]),
            "question": doc.get("question"),
            "response_time_ms": doc.get("response_time_ms"),
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        }

    return {
        "chats_last_14_days": await series_days("chat_history"),
        "students_registered_14_days": await series_days("students"),
        "student_by_department": student_by_dept,
        "notices_by_priority": notices_by_priority,
        "recent_chats": recent_chats,
    }


@router.get("/activity", summary="Latest activity feed")
async def activity(admin=Depends(require_admin()), limit: int = 15):
    db = get_db()
    events = []

    async def add_events(collection: str, label: str, only_authored: bool = False):
        cursor = db[collection].find().sort("created_at", -1).limit(limit)
        async for doc in cursor:
            events.append(
                {
                    "type": label,
                    "title": doc.get("title") or doc.get("name") or doc.get("company") or doc.get("question", "Activity"),
                    "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                    "id": str(doc["_id"]),
                }
            )

    await add_events("notices", "Notice")
    await add_events("events", "Event")
    await add_events("placements", "Placement")
    await add_events("knowledge_base", "Knowledge Document")
    await add_events("students", "Student")
    await add_events("faculty", "Faculty")
    await add_events("gallery", "Gallery")
    events.sort(key=lambda e: e["created_at"] or "", reverse=True)
    return {"items": events[:limit], "total": len(events[:limit])}
