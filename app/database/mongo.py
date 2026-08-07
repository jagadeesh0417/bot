"""Async MongoDB connection via Motor with index setup."""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config.settings import settings
from app.utils.logger import mongo_logger

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> None:
    global _client, _db
    if _client is not None:
        return
    _client = AsyncIOMotorClient(
        settings.MONGODB_URL,
        serverSelectionTimeoutMS=5000,
        maxPoolSize=50,
        connectTimeoutMS=10000,
    )
    _db = _client[settings.MONGODB_DB]
    await _db.command("ping")
    mongo_logger.info("Connected to MongoDB: %s", settings.MONGODB_DB)
    await _create_indexes()


async def close_mongo_connection() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None
    mongo_logger.info("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised. Call connect_to_mongo() first.")
    return _db


async def _create_indexes() -> None:
    db = get_db()

    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)

    await db.students.create_index([("user_id", 1)])
    await db.students.create_index([("name", 1)])
    await db.students.create_index([("department_id", 1)])
    await db.students.create_index([("semester", 1)])

    await db.faculty.create_index([("name", 1)])
    await db.faculty.create_index([("department_id", 1)])
    await db.faculty.create_index([("email", 1)], unique=True, sparse=True)

    await db.departments.create_index([("name", 1)], unique=True)

    await db.courses.create_index([("code", 1)], unique=True)
    await db.courses.create_index([("department_id", 1)])

    await db.notices.create_index([("created_at", -1)])
    await db.notices.create_index([("pinned", -1)])

    await db.events.create_index([("date", 1)])
    await db.gallery.create_index([("created_at", -1)])
    await db.placements.create_index([("drive_date", 1)])
    await db.timetable.create_index([("department_id", 1), ("semester", 1)])
    await db.knowledge_base.create_index([("title", 1)])

    await db.chat_history.create_index([("user_id", 1), ("session_id", 1), ("created_at", -1)])
    await db.chat_history.create_index([("user_id", 1), ("created_at", -1)])

    await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
    await db.chat_sessions.create_index([("user_id", 1), ("updated_at", -1)])

    mongo_logger.info("MongoDB indexes created")
