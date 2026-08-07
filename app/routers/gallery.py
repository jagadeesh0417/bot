from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.cloudinary.client import delete_file
from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import NotFoundException
from app.schemas.modules import GalleryCreate, GalleryUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/gallery", tags=["Gallery"])


@router.get("", summary="List gallery items")
async def list_gallery(page: int = 1, page_size: int = 20, album: str | None = None, media_type: str | None = None):
    db = get_db()
    query: dict = {}
    if album:
        query["album"] = album
    if media_type:
        query["media_type"] = media_type
    return await paginate(db.gallery, query, page, page_size, [("created_at", -1)])


@router.get("/albums", summary="List albums")
async def albums():
    db = get_db()
    rows = [r async for r in db.gallery.aggregate([{"$group": {"_id": "$album", "count": {"$sum": 1}}}])]
    items = [{"name": r["_id"], "count": r["count"]} for r in rows if r["_id"]]
    return {"items": items, "total": len(items)}


@router.get("/{item_id}", summary="Get gallery item")
async def get_item(item_id: str):
    db = get_db()
    item = await db.gallery.find_one({"_id": ObjectId(item_id)})
    if not item:
        raise NotFoundException("Gallery item not found")
    return serialize(item)


@router.post("", status_code=201, summary="Add gallery item (admin)", dependencies=[Depends(require_admin())])
async def create_item(payload: GalleryCreate):
    db = get_db()
    doc = {
        "title": clean_text(payload.title),
        "media_type": payload.media_type,
        "url": payload.url,
        "public_id": payload.public_id,
        "album": clean_text(payload.album) if payload.album else None,
        "description": clean_text(payload.description) if payload.description else None,
        "event_id": ObjectId(payload.event_id) if payload.event_id and ObjectId.is_valid(payload.event_id) else None,
        "likes": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.gallery.insert_one(doc)
    return serialize(await db.gallery.find_one({"_id": result.inserted_id}))


@router.patch("/{item_id}", summary="Update gallery item (admin)", dependencies=[Depends(require_admin())])
async def update_item(item_id: str, payload: GalleryUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        data["title"] = clean_text(data["title"])
    if "description" in data:
        data["description"] = clean_text(data["description"]) if data["description"] else None
    if "album" in data:
        data["album"] = clean_text(data["album"]) if data["album"] else None
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "gallery", item_id, data, "Gallery item")


@router.delete("/{item_id}", status_code=204, summary="Delete gallery item (admin)", dependencies=[Depends(require_admin())])
async def delete_item(item_id: str):
    db = get_db()
    item = await db.gallery.find_one({"_id": ObjectId(item_id)})
    if not item:
        raise NotFoundException("Gallery item not found")
    if item.get("public_id"):
        await delete_file(item["public_id"])
    await db.gallery.delete_one({"_id": item["_id"]})


@router.post("/{item_id}/like", summary="Like a gallery item")
async def like_item(item_id: str):
    db = get_db()
    await db.gallery.update_one({"_id": ObjectId(item_id)}, {"$inc": {"likes": 1}})
    return {"success": True, "detail": "Liked"}
