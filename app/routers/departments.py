from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import ConflictException, NotFoundException
from app.schemas.modules import DepartmentCreate, DepartmentUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/departments", tags=["Departments"])


@router.get("", summary="List departments")
async def list_departments(page: int = 1, page_size: int = 20, search: str | None = None):
    db = get_db()
    query = {}
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": regex}, {"code": regex}]
    return await paginate(db.departments, query, page, page_size, [("name", 1)])


@router.get("/public", summary="Public department list (no auth)")
async def public_departments():
    db = get_db()
    items = [serialize(d) async for d in db.departments.find().sort("name", 1)]
    return {"items": items, "total": len(items)}


@router.get("/{department_id}", summary="Get department detail with stats")
async def get_department(department_id: str):
    db = get_db()
    dept = await db.departments.find_one({"_id": ObjectId(department_id)})
    if not dept:
        raise NotFoundException("Department not found")
    result = serialize(dept)
    result["students_count"] = await db.students.count_documents({"department_id": dept["_id"]})
    result["faculty_count"] = await db.faculty.count_documents({"department_id": dept["_id"]})
    result["courses_count"] = await db.courses.count_documents({"department_id": dept["_id"]})
    return result


@router.post("", status_code=201, summary="Create department", dependencies=[Depends(require_admin())])
async def create_department(payload: DepartmentCreate):
    db = get_db()
    if await db.departments.find_one({"code": payload.code}):
        raise ConflictException("Department code already exists")
    doc = {
        "name": clean_text(payload.name),
        "code": clean_text(payload.code),
        "head_name": clean_text(payload.head_name) if payload.head_name else None,
        "description": clean_text(payload.description) if payload.description else None,
        "established_year": payload.established_year,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.departments.insert_one(doc)
    return serialize(await db.departments.find_one({"_id": result.inserted_id}))


@router.patch("/{department_id}", summary="Update department", dependencies=[Depends(require_admin())])
async def update_department(department_id: str, payload: DepartmentUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "code", "head_name", "description"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    if "code" in data:
        existing = await db.departments.find_one({"code": data["code"], "_id": {"$ne": ObjectId(department_id)}})
        if existing:
            raise ConflictException("Department code already exists")
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "departments", department_id, data, "Department")


@router.delete("/{department_id}", status_code=204, summary="Delete department", dependencies=[Depends(require_admin())])
async def delete_department(department_id: str):
    db = get_db()
    await db.departments.delete_one({"_id": ObjectId(department_id)})
