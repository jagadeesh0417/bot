from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import BadRequestException, ConflictException, NotFoundException
from app.schemas.modules import FacultyCreate, FacultyUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/faculty", tags=["Faculty"])


async def _faculty_query(search: str | None, department_id: str | None, designation: str | None) -> dict:
    query: dict = {}
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": regex}, {"email": regex}, {"subjects": regex}]
    if department_id:
        query["department_id"] = ObjectId(department_id)
    if designation:
        query["designation"] = designation
    return query


@router.get("", summary="List faculty with filters")
async def list_faculty(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    department_id: str | None = None,
    designation: str | None = None,
):
    db = get_db()
    query = await _faculty_query(search, department_id, designation)
    result = await paginate(db.faculty, query, page, page_size, [("name", 1)])
    for item in result["items"]:
        if item.get("department_id"):
            dept = await db.departments.find_one({"_id": ObjectId(item["department_id"])})
            item["department"] = dept.get("name") if dept else None
    return result


@router.get("/public", summary="Public faculty list")
async def public_faculty(department_id: str | None = None):
    db = get_db()
    query = {"department_id": ObjectId(department_id)} if department_id else {}
    items = [serialize(d) async for d in db.faculty.find(query).sort("name", 1)]
    for item in items:
        if item.get("department_id"):
            dept = await db.departments.find_one({"_id": ObjectId(item["department_id"])})
            item["department"] = dept.get("name") if dept else None
    return {"items": items, "total": len(items)}


@router.get("/{faculty_id}", summary="Get faculty")
async def get_faculty(faculty_id: str):
    db = get_db()
    faculty = await db.faculty.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise NotFoundException("Faculty not found")
    result = serialize(faculty)
    if faculty.get("department_id"):
        dept = await db.departments.find_one({"_id": faculty["department_id"]})
        result["department"] = dept.get("name") if dept else None
    return result


@router.post("", status_code=201, summary="Create faculty (admin)", dependencies=[Depends(require_admin())])
async def create_faculty(payload: FacultyCreate):
    db = get_db()
    email = payload.email.strip().lower() if payload.email else None
    if email and await db.faculty.find_one({"email": email}):
        raise ConflictException("A faculty member with this email already exists")
    if not await db.departments.find_one({"_id": ObjectId(payload.department_id)}):
        raise BadRequestException("Invalid department")

    doc = {
        "name": clean_text(payload.name),
        "email": email,
        "department_id": ObjectId(payload.department_id),
        "designation": clean_text(payload.designation),
        "qualification": clean_text(payload.qualification) if payload.qualification else None,
        "experience_years": payload.experience_years,
        "subjects": [clean_text(s) for s in payload.subjects if s],
        "phone": clean_text(payload.phone) if payload.phone else None,
        "office": clean_text(payload.office) if payload.office else None,
        "bio": clean_text(payload.bio) if payload.bio else None,
        "joining_date": payload.joining_date,
        "photo_url": None,
        "photo_public_id": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.faculty.insert_one(doc)
    return serialize(await db.faculty.find_one({"_id": result.inserted_id}))


@router.patch("/{faculty_id}", summary="Update faculty (admin)", dependencies=[Depends(require_admin())])
async def update_faculty(faculty_id: str, payload: FacultyUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "email" in data:
        email = (data["email"] or "").strip().lower()
        data["email"] = email or None
    for field in ("name", "designation", "qualification", "phone", "office", "bio"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    if "department_id" in data:
        if not await db.departments.find_one({"_id": ObjectId(data["department_id"])}):
            raise BadRequestException("Invalid department")
        data["department_id"] = ObjectId(data["department_id"])
    if "subjects" in data and data["subjects"] is not None:
        data["subjects"] = [clean_text(s) for s in data["subjects"]]
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "faculty", faculty_id, data, "Faculty")


@router.delete("/{faculty_id}", status_code=204, summary="Delete faculty (admin)", dependencies=[Depends(require_admin())])
async def delete_faculty(faculty_id: str):
    db = get_db()
    faculty = await db.faculty.find_one({"_id": ObjectId(faculty_id)})
    if not faculty:
        raise NotFoundException("Faculty not found")
    if faculty.get("photo_public_id"):
        from app.cloudinary.client import delete_file

        await delete_file(faculty["photo_public_id"])
    await db.faculty.delete_one({"_id": ObjectId(faculty_id)})
