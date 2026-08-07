from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin, require_student
from app.models.base import BadRequestException, ConflictException, NotFoundException
from app.schemas.modules import CourseCreate, CourseUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/courses", tags=["Courses"])


@router.get("", summary="List courses")
async def list_courses(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    department_id: str | None = None,
    semester: int | None = None,
):
    db = get_db()
    query: dict = {}
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": regex}, {"code": regex}]
    if department_id:
        query["department_id"] = ObjectId(department_id)
    result = await paginate(db.courses, query, page, page_size, [("name", 1)])
    for item in result["items"]:
        if item.get("department_id"):
            dept = await db.departments.find_one({"_id": ObjectId(item["department_id"])})
            item["department"] = dept.get("name") if dept else None
        if semester:
            item["subjects"] = [s for s in item.get("subjects", []) if s.get("semester") == semester]
    return result


@router.get("/public", summary="Public course list")
async def public_courses(department_id: str | None = None):
    db = get_db()
    query = {"department_id": ObjectId(department_id)} if department_id else {}
    items = [serialize(d) async for d in db.courses.find(query).sort("name", 1)]
    return {"items": items, "total": len(items)}


@router.get("/{course_id}", summary="Get course")
async def get_course(course_id: str):
    db = get_db()
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise NotFoundException("Course not found")
    result = serialize(course)
    if course.get("department_id"):
        dept = await db.departments.find_one({"_id": course["department_id"]})
        result["department"] = dept.get("name") if dept else None
    return result


@router.post("", status_code=201, summary="Create course (admin)", dependencies=[Depends(require_admin())])
async def create_course(payload: CourseCreate):
    db = get_db()
    if await db.courses.find_one({"code": payload.code}):
        raise ConflictException("Course code already exists")
    if not await db.departments.find_one({"_id": ObjectId(payload.department_id)}):
        raise BadRequestException("Invalid department")
    doc = {
        "code": clean_text(payload.code),
        "name": clean_text(payload.name),
        "department_id": ObjectId(payload.department_id),
        "description": clean_text(payload.description) if payload.description else None,
        "semesters": payload.semesters,
        "credits": payload.credits,
        "subjects": [s.model_dump() for s in payload.subjects],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.courses.insert_one(doc)
    return serialize(await db.courses.find_one({"_id": result.inserted_id}))


@router.patch("/{course_id}", summary="Update course (admin)", dependencies=[Depends(require_admin())])
async def update_course(course_id: str, payload: CourseUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "code", "description"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    if "department_id" in data:
        if not await db.departments.find_one({"_id": ObjectId(data["department_id"])}):
            raise BadRequestException("Invalid department")
        data["department_id"] = ObjectId(data["department_id"])
    if "subjects" in data and data["subjects"] is not None:
        data["subjects"] = [s.model_dump() for s in data["subjects"]]
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "courses", course_id, data, "Course")


@router.delete("/{course_id}", status_code=204, summary="Delete course (admin)", dependencies=[Depends(require_admin())])
async def delete_course(course_id: str):
    db = get_db()
    await db.courses.delete_one({"_id": ObjectId(course_id)})
    await db.students.update_many({"courses": ObjectId(course_id)}, {"$pull": {"courses": ObjectId(course_id)}})


@router.post("/{course_id}/enroll", summary="Student self-enroll in course")
async def enroll(course_id: str, current_user=Depends(require_student())):
    db = get_db()
    course = await db.courses.find_one({"_id": ObjectId(course_id)})
    if not course:
        raise NotFoundException("Course not found")
    await db.students.update_one(
        {"user_id": ObjectId(current_user["user_id"])},
        {"$addToSet": {"courses": course["_id"]}},
    )
    return {"success": True, "detail": f"Enrolled in {course['name']}"}
