from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.authentication.security import hash_password
from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import BadRequestException, ConflictException, NotFoundException
from app.schemas.modules import StudentCreate, StudentUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/students", tags=["Students"])


async def _student_query(search: str | None, department_id: str | None, semester: int | None, status: str | None, course_id: str | None) -> dict:
    query: dict = {}
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": regex}, {"email": regex}, {"roll_number": regex}]
    if department_id:
        query["department_id"] = ObjectId(department_id)
    if semester:
        query["semester"] = semester
    if status:
        query["status"] = status
    if course_id:
        query["courses"] = ObjectId(course_id)
    return query


@router.get("", summary="List students with filters")
async def list_students(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    department_id: str | None = None,
    semester: int | None = None,
    status: str | None = None,
    course_id: str | None = None,
):
    db = get_db()
    query = await _student_query(search, department_id, semester, status, course_id)
    result = await paginate(db.students, query, page, page_size, [("name", 1)])
    for item in result["items"]:
        if item.get("department_id"):
            dept = await db.departments.find_one({"_id": ObjectId(item["department_id"])})
            item["department"] = dept.get("name") if dept else None
    return result


@router.get("/{student_id}", summary="Get student")
async def get_student(student_id: str):
    db = get_db()
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise NotFoundException("Student not found")
    result = serialize(student)
    if student.get("department_id"):
        dept = await db.departments.find_one({"_id": student["department_id"]})
        result["department"] = dept.get("name") if dept else None
    result["courses_detail"] = []
    for cid in student.get("courses", []):
        course = await db.courses.find_one({"_id": cid})
        if course:
            result["courses_detail"].append({"id": str(cid), "code": course.get("code"), "name": course.get("name")})
    return result


@router.post("", status_code=201, summary="Create student (admin)")
async def create_student(payload: StudentCreate, admin=Depends(require_admin())):
    db = get_db()
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise ConflictException("A user with this email already exists")
    if not await db.departments.find_one({"_id": ObjectId(payload.department_id)}):
        raise BadRequestException("Invalid department")

    user_id = ObjectId()
    await db.users.insert_one(
        {
            "_id": user_id,
            "name": clean_text(payload.name),
            "email": email,
            "role": "student",
            "password_hash": hash_password(payload.password),
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
    )
    course_ids = []
    for cid in payload.courses:
        try:
            course_ids.append(ObjectId(cid))
        except Exception:
            pass

    doc = {
        "user_id": user_id,
        "name": clean_text(payload.name),
        "email": email,
        "department_id": ObjectId(payload.department_id),
        "semester": payload.semester,
        "roll_number": clean_text(payload.roll_number) or None,
        "phone": clean_text(payload.phone) or None,
        "gender": clean_text(payload.gender) or None,
        "date_of_birth": payload.date_of_birth,
        "address": clean_text(payload.address) or None,
        "courses": course_ids,
        "status": "active",
        "photo_url": None,
        "photo_public_id": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.students.insert_one(doc)
    await _notify_user(db, user_id, "Account created", f"Welcome {clean_text(payload.name)}! Your student account has been created.")
    return serialize(await db.students.find_one({"_id": result.inserted_id}))


async def _notify_user(db, user_id, title: str, message: str) -> None:
    try:
        await db.notifications.insert_one(
            {
                "user_id": user_id,
                "title": title,
                "message": message,
                "type": "info",
                "read": False,
                "link": None,
                "created_at": datetime.utcnow(),
            }
        )
    except Exception:
        pass


@router.patch("/{student_id}", summary="Update student (admin)")
async def update_student(student_id: str, payload: StudentUpdate, admin=Depends(require_admin())):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = clean_text(data["name"])
    if "department_id" in data:
        if not await db.departments.find_one({"_id": ObjectId(data["department_id"])}):
            raise BadRequestException("Invalid department")
        data["department_id"] = ObjectId(data["department_id"])
    if "courses" in data and data["courses"] is not None:
        data["courses"] = [ObjectId(c) for c in data["courses"] if ObjectId.is_valid(c)]
    for field in ("phone", "roll_number", "gender", "address"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    data["updated_at"] = datetime.utcnow()
    student = await update_doc(db, "students", student_id, data, "Student")
    if "name" in data:
        await db.users.update_one(
            {"_id": student["user_id"]},
            {"$set": {"name": data["name"], "updated_at": datetime.utcnow()}},
        )
    return student


@router.delete("/{student_id}", status_code=204, summary="Delete student (admin)")
async def delete_student(student_id: str, admin=Depends(require_admin())):
    db = get_db()
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise NotFoundException("Student not found")
    if student.get("user_id"):
        await db.users.delete_one({"_id": student["user_id"]})
        await db.chat_history.delete_many({"user_id": student["user_id"]})
        await db.chat_sessions.delete_many({"user_id": student["user_id"]})
    await db.students.delete_one({"_id": ObjectId(student_id)})
