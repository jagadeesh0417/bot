"""Shared helpers: id conversion, pagination, sanitization, serialization."""
from __future__ import annotations

import html
import re
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument

from app.database.mongo import get_db
from app.models.base import BadRequestException


def oid(value: str | ObjectId | None) -> ObjectId:
    if value is None:
        raise BadRequestException("Missing id")
    try:
        return ObjectId(value) if isinstance(value, str) else value
    except Exception:
        raise BadRequestException("Invalid id format")


def clean_text(value: str | None) -> str:
    """Sanitize input: strip tags, escape HTML, collapse whitespace."""
    if not value:
        return ""
    value = re.sub(r"<[^>]+>", " ", str(value))
    value = html.escape(value, quote=True)
    return re.sub(r"\s+", " ", value).strip()


def sanitize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def serialize(doc: Any) -> dict:
    """Convert a Mongo document into a JSON-safe dict."""
    if doc is None:
        return None
    out: dict = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, dict):
            out[k] = serialize(v)
        elif isinstance(v, list):
            out[k] = [serialize(i) if isinstance(i, dict) else i for i in v]
        else:
            out[k] = v
    return out


async def find_one_or_404(db, collection: str, doc_id: str, label: str | None = None) -> dict:
    doc = await db[collection].find_one({"_id": oid(doc_id)})
    if not doc:
        raise BadRequestException(f"{label or collection.rstrip('s').capitalize()} not found")
    return doc


async def paginate(collection, query: dict, page: int, page_size: int, sort: Any = None):
    """Generic pagination returning items + meta."""
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    cursor = collection.find(query)
    total = await collection.count_documents(query)
    if sort:
        cursor = cursor.sort(sort)
    items = [serialize(doc) async for doc in cursor.skip((page - 1) * page_size).limit(page_size)]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


async def update_doc(db, collection: str, doc_id: str, payload: dict, label: str | None = None) -> dict:
    doc = await db[collection].find_one_and_update(
        {"_id": oid(doc_id)},
        {"$set": payload},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise BadRequestException(f"{label or collection.rstrip('s').capitalize()} not found")
    return serialize(doc)


async def ensure_admin_session_store() -> None:
    """Tracks active refresh-token sessions for logout/session management."""
    await get_db().admin_sessions.create_index("token_hash", unique=True, sparse=True)
