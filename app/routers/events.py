from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.models.base import NotFoundException
from app.schemas.modules import EventCreate, EventUpdate
from app.utils.helpers import clean_text, paginate, serialize, update_doc

router = APIRouter(prefix="/api/events", tags=["Events"])


def _parse_date(value: str):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            from datetime import date

            return datetime.combine(date.fromisoformat(value), datetime.min.time())
        except ValueError:
            return None


@router.get("", summary="List events")
async def list_events(page: int = 1, page_size: int = 20, search: str | None = None, category: str | None = None, upcoming_only: bool = False):
    db = get_db()
    query: dict = {}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    if category:
        query["category"] = category
    if upcoming_only:
        query["date"] = {"$gte": datetime.utcnow()}
    result = await paginate(db.events, query, page, page_size, [("date", 1)])
    return result


@router.get("/categories", summary="Event categories with counts")
async def categories():
    db = get_db()
    pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    rows = [r async for r in db.events.aggregate(pipeline)]
    return {"items": [{"category": r["_id"], "count": r["count"]} for r in rows]}


@router.get("/{event_id}", summary="Get event")
async def get_event(event_id: str):
    db = get_db()
    event = await db.events.find_one({"_id": ObjectId(event_id)})
    if not event:
        raise NotFoundException("Event not found")
    return serialize(event)


@router.post("", status_code=201, summary="Create event (admin)", dependencies=[Depends(require_admin())])
async def create_event(payload: EventCreate):
    db = get_db()
    doc = {
        "title": clean_text(payload.title),
        "description": clean_text(payload.description) if payload.description else None,
        "category": payload.category,
        "date": _parse_date(payload.date),
        "time": payload.time,
        "venue": clean_text(payload.venue) if payload.venue else None,
        "registration_link": payload.registration_link,
        "organizer": clean_text(payload.organizer) if payload.organizer else None,
        "poster_url": None,
        "poster_public_id": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.events.insert_one(doc)
    return serialize(await db.events.find_one({"_id": result.inserted_id}))


@router.patch("/{event_id}", summary="Update event (admin)", dependencies=[Depends(require_admin())])
async def update_event(event_id: str, payload: EventUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        data["title"] = clean_text(data["title"])
    if "description" in data:
        data["description"] = clean_text(data["description"]) if data["description"] else None
    if "venue" in data:
        data["venue"] = clean_text(data["venue"]) if data["venue"] else None
    if "organizer" in data:
        data["organizer"] = clean_text(data["organizer"]) if data["organizer"] else None
    if "date" in data:
        data["date"] = _parse_date(data["date"])
    data["updated_at"] = datetime.utcnow()
    return await update_doc(db, "events", event_id, data, "Event")


@router.delete("/{event_id}", status_code=204, summary="Delete event (admin)", dependencies=[Depends(require_admin())])
async def delete_event(event_id: str):
    db = get_db()
    await db.events.delete_one({"_id": ObjectId(event_id)})
