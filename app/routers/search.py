from bson import ObjectId
from fastapi import APIRouter

from app.database.mongo import get_db
from app.utils.helpers import serialize

router = APIRouter(prefix="/api/search", tags=["Global Search"])

SEARCHABLE = [
    ("students", ["name", "email", "roll_number"]),
    ("faculty", ["name", "email", "subjects"]),
    ("courses", ["name", "code"]),
    ("departments", ["name", "code"]),
    ("notices", ["title", "content"]),
    ("events", ["title", "description"]),
    ("placements", ["company", "role"]),
    ("knowledge_base", ["title", "description"]),
    ("gallery", ["title", "description"]),
]


@router.get("", summary="Search across all modules")
async def global_search(q: str, page: int = 1, page_size: int = 5):
    db = get_db()
    results: dict = {}
    regex = {"$regex": q, "$options": "i"}
    for collection, fields in SEARCHABLE:
        query = {"$or": [{f: regex} for f in fields]}
        cursor = db[collection].find(query).sort("created_at", -1).limit(page_size)
        items = [serialize(doc) async for doc in cursor]
        results[collection] = {"items": items, "total": len(items)}
    return results
