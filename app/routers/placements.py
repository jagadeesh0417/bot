from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import NotFoundException
from app.schemas.modules import PlacementCreate, PlacementUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/placements", tags=["Placements"])


def _parse_date(value: str):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        from datetime import date

        return datetime.combine(date.fromisoformat(value), datetime.min.time())


@router.get("", summary="List placements")
async def list_placements(
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    status: str | None = None,
    upcoming_only: bool = False,
):
    db = get_db()
    query: dict = {}
    if search:
        query["$or"] = [
            {"company": {"$regex": search, "$options": "i"}},
            {"role": {"$regex": search, "$options": "i"}},
        ]
    if status:
        query["status"] = status
    if upcoming_only:
        query["drive_date"] = {"$gte": datetime.utcnow()}
    return await paginate(db.placements, query, page, page_size, [("drive_date", 1)])


@router.get("/{placement_id}", summary="Get placement")
async def get_placement(placement_id: str):
    db = get_db()
    placement = await db.placements.find_one({"_id": ObjectId(placement_id)})
    if not placement:
        raise NotFoundException("Placement not found")
    return serialize(placement)


@router.post("", status_code=201, summary="Create placement (admin)", dependencies=[Depends(require_admin())])
async def create_placement(payload: PlacementCreate):
    db = get_db()
    doc = {
        "company": clean_text(payload.company),
        "package": clean_text(payload.package) if payload.package else None,
        "role": clean_text(payload.role) if payload.role else None,
        "eligibility": clean_text(payload.eligibility) if payload.eligibility else None,
        "drive_date": _parse_date(payload.drive_date),
        "registration_link": payload.registration_link,
        "selection_process": clean_text(payload.selection_process) if payload.selection_process else None,
        "interview_tips": clean_text(payload.interview_tips) if payload.interview_tips else None,
        "branches_eligible": [clean_text(b) for b in payload.branches_eligible if b],
        "status": payload.status,
        "logo_url": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.placements.insert_one(doc)
    return serialize(await db.placements.find_one({"_id": result.inserted_id}))


@router.patch("/{placement_id}", summary="Update placement (admin)", dependencies=[Depends(require_admin())])
async def update_placement(placement_id: str, payload: PlacementUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    for field in ("company", "package", "role", "eligibility", "selection_process", "interview_tips"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    if "drive_date" in data:
        data["drive_date"] = _parse_date(data["drive_date"])
    if "branches_eligible" in data and data["branches_eligible"] is not None:
        data["branches_eligible"] = [clean_text(b) for b in data["branches_eligible"]]
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "placements", placement_id, data, "Placement")


@router.delete("/{placement_id}", status_code=204, summary="Delete placement (admin)", dependencies=[Depends(require_admin())])
async def delete_placement(placement_id: str):
    db = get_db()
    await db.placements.delete_one({"_id": ObjectId(placement_id)})
