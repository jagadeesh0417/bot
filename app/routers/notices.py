from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import NotFoundException
from app.schemas.modules import NoticeCreate, NoticeUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/notices", tags=["Notices"])


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("", summary="List notices")
async def list_notices(page: int = 1, page_size: int = 20, search: str | None = None, category: str | None = None, pinned_only: bool = False):
    db = get_db()
    query: dict = {}
    or_clauses: list[dict] = [{"expires_at": None}]
    if search:
        regex = {"$regex": search, "$options": "i"}
        or_clauses.extend([{"title": regex}, {"content": regex}])
    query["$or"] = or_clauses
    if category:
        query["category"] = category
    if pinned_only:
        query["pinned"] = True
    result = await paginate(db.notices, query, page, page_size, [("pinned", -1), ("created_at", -1)])
    now = datetime.utcnow()
    result["items"] = [
        item
        for item in result["items"]
        if not (item.get("expires_at") and item.get("expires_at") < now)
    ]
    return result


@router.get("/pinned", summary="Pinned notices")
async def pinned_notices():
    db = get_db()
    items = [serialize(d) async for d in db.notices.find({"pinned": True}).sort("created_at", -1).limit(5)]
    return {"items": items, "total": len(items)}


@router.get("/{notice_id}", summary="Get notice")
async def get_notice(notice_id: str):
    db = get_db()
    notice = await db.notices.find_one({"_id": ObjectId(notice_id)})
    if not notice:
        raise NotFoundException("Notice not found")
    await db.notices.update_one({"_id": notice["_id"]}, {"$inc": {"views": 1}})
    return serialize(notice)


@router.post("", status_code=201, summary="Create notice (admin)", dependencies=[Depends(require_admin())])
async def create_notice(payload: NoticeCreate):
    db = get_db()
    doc = {
        "title": clean_text(payload.title),
        "content": clean_text(payload.content),
        "priority": payload.priority,
        "pinned": payload.pinned,
        "category": clean_text(payload.category) if payload.category else None,
        "expires_at": _parse_date(payload.expires_at),
        "attachment_type": payload.attachment_type,
        "attachment_url": payload.attachment_url,
        "views": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.notices.insert_one(doc)
    return serialize(await db.notices.find_one({"_id": result.inserted_id}))


@router.patch("/{notice_id}", summary="Update notice (admin)", dependencies=[Depends(require_admin())])
async def update_notice(notice_id: str, payload: NoticeUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        data["title"] = clean_text(data["title"])
    if "content" in data:
        data["content"] = clean_text(data["content"])
    if "category" in data:
        data["category"] = clean_text(data["category"]) if data["category"] else None
    if "expires_at" in data:
        data["expires_at"] = _parse_date(data["expires_at"])
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "notices", notice_id, data, "Notice")


@router.delete("/{notice_id}", status_code=204, summary="Delete notice (admin)", dependencies=[Depends(require_admin())])
async def delete_notice(notice_id: str):
    db = get_db()
    await db.notices.delete_one({"_id": ObjectId(notice_id)})
