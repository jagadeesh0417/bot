"""Chatbot engine: session management, history, retrieval-augmented answers."""
from __future__ import annotations

import re
import time
import uuid
from datetime import datetime

from bson import ObjectId

from app.database.mongo import get_db
from app.knowledgebase.processor import build_answer, search_chunks
from app.utils.helpers import serialize
from app.utils.logger import ai_logger

MAX_HISTORY_MESSAGES = 200


def _normalize_question(message: str) -> str:
    return re.sub(r"\s+", " ", message.strip())


async def get_or_create_session(user_id: str, session_id: str | None) -> tuple[str, dict]:
    db = get_db()
    if session_id:
        session = await db.chat_sessions.find_one({"_id": ObjectId(session_id), "user_id": ObjectId(user_id)})
        if session:
            return str(session["_id"]), session
    now = datetime.utcnow()
    new_session = {
        "user_id": ObjectId(user_id),
        "title": "New Chat",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }
    result = await db.chat_sessions.insert_one(new_session)
    return str(result.inserted_id), new_session


async def list_sessions(user_id: str, search: str | None = None) -> list[dict]:
    db = get_db()
    query: dict = {"user_id": ObjectId(user_id)}
    if search:
        query["title"] = {"$regex": search, "$options": "i"}
    items = [
        serialize(s)
        async for s in db.chat_sessions.find(query).sort("updated_at", -1).limit(100)
    ]
    return items


async def get_history(user_id: str, session_id: str, limit: int = 50) -> list[dict]:
    db = get_db()
    cursor = (
        db.chat_history.find({"user_id": ObjectId(user_id), "session_id": ObjectId(session_id)})
        .sort("created_at", -1)
        .limit(min(limit, MAX_HISTORY_MESSAGES))
    )
    items = [serialize(doc) async for doc in cursor]
    items.reverse()
    return items


async def rename_session(user_id: str, session_id: str, title: str) -> dict:
    db = get_db()
    session = await db.chat_sessions.find_one_and_update(
        {"_id": ObjectId(session_id), "user_id": ObjectId(user_id)},
        {"$set": {"title": title[:150], "updated_at": datetime.utcnow()}},
        return_document=True,
    )
    return serialize(session)


async def delete_session(user_id: str, session_id: str) -> None:
    db = get_db()
    await db.chat_history.delete_many({"user_id": ObjectId(user_id), "session_id": ObjectId(session_id)})
    await db.chat_sessions.delete_one({"_id": ObjectId(session_id), "user_id": ObjectId(user_id)})


async def handle_message(user_id: str, message: str, session_id: str | None, language: str = "en") -> dict:
    db = get_db()
    start = time.perf_counter()
    question = _normalize_question(message)

    session_id, session = await get_or_create_session(user_id, session_id)
    history = await get_history(user_id, session_id, limit=10)
    context = await search_chunks(question, limit=4)

    answer = await build_answer(question, context, history, language)
    response_ms = int((time.perf_counter() - start) * 1000)

    await db.chat_history.insert_one(
        {
            "user_id": ObjectId(user_id),
            "session_id": ObjectId(session_id),
            "question": question,
            "answer": answer,
            "language": language,
            "sources": context[:4],
            "response_time_ms": response_ms,
            "created_at": datetime.utcnow(),
        }
    )
    await db.chat_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"updated_at": datetime.utcnow()}, "$inc": {"message_count": 1}},
    )
    ai_logger.info("Chat answered in %sms (session=%s)", response_ms, session_id)

    return {
        "session_id": session_id,
        "answer": answer,
        "sources": context[:4],
        "response_time_ms": response_ms,
    }


async def search_history(user_id: str, query: str, page: int = 1, page_size: int = 20) -> dict:
    db = get_db()
    regex = {"$regex": query, "$options": "i"}
    mongo_query = {
        "user_id": ObjectId(user_id),
        "$or": [{"question": regex}, {"answer": regex}],
    }
    total = await db.chat_history.count_documents(mongo_query)
    cursor = (
        db.chat_history.find(mongo_query)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items = [serialize(doc) async for doc in cursor]
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": (total + page_size - 1) // page_size}


async def delete_history_entry(user_id: str, entry_id: str) -> None:
    db = get_db()
    await db.chat_history.delete_one({"_id": ObjectId(entry_id), "user_id": ObjectId(user_id)})


async def export_history(user_id: str) -> list[dict]:
    db = get_db()
    items = [
        serialize(doc)
        async for doc in db.chat_history.find({"user_id": ObjectId(user_id)}).sort("created_at", 1)
    ]
    return items
