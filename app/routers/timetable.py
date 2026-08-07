from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin, require_student
from app.models.base import BadRequestException, NotFoundException
from app.schemas.modules import TimetableCreate, TimetableUpdate
from app.utils.helpers import paginate, serialize, update_doc

router = APIRouter(prefix="/api/timetable", tags=["Timetable"])


@router.get("", summary="List timetables")
async def list_timetables(page: int = 1, page_size: int = 20, department_id: str | None = None, semester: int | None = None, search: str | None = None):
    db = get_db()
    query: dict = {}
    if department_id:
        query["department_id"] = ObjectId(department_id)
    if semester:
        query["semester"] = semester
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    return await paginate(db.timetable, query, page, page_size, [("created_at", -1)])


@router.get("/my", summary="Student's timetable by their department & semester")
async def my_timetable(current_user=Depends(require_student())):
    db = get_db()
    student = await db.students.find_one({"user_id": ObjectId(current_user["user_id"])})
    if not student or not student.get("department_id"):
        raise BadRequestException("Student profile incomplete")
    items = [
        serialize(t)
        async for t in db.timetable.find(
            {"department_id": student["department_id"], "semester": student.get("semester", 1)}
        ).sort("created_at", -1)
    ]
    return {"items": items, "total": len(items)}


@router.get("/{tt_id}", summary="Get timetable")
async def get_timetable(tt_id: str):
    db = get_db()
    tt = await db.timetable.find_one({"_id": ObjectId(tt_id)})
    if not tt:
        raise NotFoundException("Timetable not found")
    result = serialize(tt)
    if tt.get("department_id"):
        dept = await db.departments.find_one({"_id": tt["department_id"]})
        result["department"] = dept.get("name") if dept else None
    return result


@router.post("", status_code=201, summary="Create timetable (admin)", dependencies=[Depends(require_admin())])
async def create_timetable(payload: TimetableCreate):
    db = get_db()
    if not await db.departments.find_one({"_id": ObjectId(payload.department_id)}):
        raise BadRequestException("Invalid department")
    doc = {
        "title": payload.title.strip(),
        "department_id": ObjectId(payload.department_id),
        "semester": payload.semester,
        "entries": [e.model_dump() for e in payload.entries],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.timetable.insert_one(doc)
    return serialize(await db.timetable.find_one({"_id": result.inserted_id}))


@router.patch("/{tt_id}", summary="Update timetable (admin)", dependencies=[Depends(require_admin())])
async def update_timetable(tt_id: str, payload: TimetableUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "entries" in data and data["entries"] is not None:
        data["entries"] = [e.model_dump() for e in data["entries"]]
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "timetable", tt_id, data, "Timetable")


@router.delete("/{tt_id}", status_code=204, summary="Delete timetable (admin)", dependencies=[Depends(require_admin())])
async def delete_timetable(tt_id: str):
    db = get_db()
    await db.timetable.delete_one({"_id": ObjectId(tt_id)})
