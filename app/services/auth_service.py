"""Authentication service: register, login, tokens, password reset, sessions."""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from bson import ObjectId

from app.authentication.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config.settings import settings
from app.database.mongo import get_db
from app.models.base import BadRequestException, ConflictException, NotFoundException, UnauthorizedException
from app.utils.helpers import clean_text, oid, sanitize_email
from app.utils.logger import auth_logger

RESET_TOKEN_TTL_MINUTES = 30


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _new_user(user_id: str, name: str, email: str, role: str, refresh_token: str, password_hash: str | None = None):
    db = get_db()
    await db.users.insert_one(
        {
            "_id": ObjectId(user_id),
            "name": name,
            "email": email,
            "role": role,
            "password_hash": password_hash,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_login": datetime.utcnow(),
            "status": "active",
        }
    )
    await db.user_sessions.insert_one(
        {
            "user_id": ObjectId(user_id),
            "token_hash": _token_hash(refresh_token),
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "active": True,
            "user_agent": None,
        }
    )


async def register_student(payload, remember_me: bool = False) -> dict:
    db = get_db()
    email = sanitize_email(payload.email)
    existing = await db.users.find_one({"email": email})
    if existing:
        raise ConflictException("An account with this email already exists")

    if payload.department_id:
        dept = await db.departments.find_one({"_id": oid(payload.department_id)})
        if not dept:
            raise BadRequestException("Invalid department")

    password_hash = hash_password(payload.password)
    user_id = str(ObjectId())
    refresh_token = create_refresh_token(user_id, "student")
    await _new_user(user_id, clean_text(payload.name), email, "student", refresh_token, password_hash)

    await db.students.insert_one(
        {
            "user_id": ObjectId(user_id),
            "name": clean_text(payload.name),
            "email": email,
            "department_id": oid(payload.department_id) if payload.department_id else None,
            "semester": payload.semester,
            "roll_number": clean_text(payload.roll_number) or None,
            "phone": clean_text(payload.phone) or None,
            "photo_url": None,
            "photo_public_id": None,
            "courses": [],
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
    )
    auth_logger.info("Student registered: %s", email)
    return {
        "access_token": create_access_token(user_id, "student"),
        "refresh_token": refresh_token,
        "role": "student",
        "name": clean_text(payload.name),
    }


async def register_admin(payload) -> dict:
    db = get_db()
    email = sanitize_email(payload.email)
    existing = await db.users.find_one({"email": email})
    if existing:
        raise ConflictException("An account with this email already exists")

    password_hash = hash_password(payload.password)
    user_id = str(ObjectId())
    refresh_token = create_refresh_token(user_id, "admin")
    await _new_user(user_id, clean_text(payload.name), email, "admin", refresh_token, password_hash)

    await db.admins.insert_one(
        {
            "user_id": ObjectId(user_id),
            "name": clean_text(payload.name),
            "email": email,
            "role": "super_admin",
            "photo_url": None,
            "created_at": datetime.utcnow(),
        }
    )
    auth_logger.info("Admin registered: %s", email)
    return {
        "access_token": create_access_token(user_id, "admin"),
        "refresh_token": refresh_token,
        "role": "admin",
        "name": clean_text(payload.name),
    }


async def login(email: str, password: str, remember_me: bool = False) -> dict:
    db = get_db()
    normalized = sanitize_email(email)
    user = await db.users.find_one({"email": normalized})
    if not user:
        raise UnauthorizedException("Invalid email or password")

    if user.get("status") != "active":
        raise UnauthorizedException("Account is disabled")

    password_hash = await _get_password_hash(user)
    if not verify_password(password, password_hash):
        raise UnauthorizedException("Invalid email or password")

    user_id = str(user["_id"])
    role = user.get("role", "student")
    if role == "admin" and not await db.admins.find_one({"user_id": user["_id"]}):
        raise UnauthorizedException("Admin account not found")

    access_minutes = settings.REFRESH_TOKEN_EXPIRE_DAYS if remember_me else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    refresh_token = create_refresh_token(user_id, role)
    await db.user_sessions.insert_one(
        {
            "user_id": user["_id"],
            "token_hash": _token_hash(refresh_token),
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "active": True,
        }
    )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}, "$push": {"login_history": {"at": datetime.utcnow(), "via": "password"}}},
    )
    auth_logger.info("Login success: %s (role=%s)", normalized, role)
    return {
        "access_token": create_access_token(user_id, role),
        "refresh_token": refresh_token,
        "role": role,
        "name": user.get("name", ""),
    }


async def _get_password_hash(user: dict) -> str:
    db = get_db()
    if user.get("role") == "admin":
        admin = await db.admins.find_one({"user_id": user["_id"]})
        if admin and admin.get("password_hash"):
            return admin["password_hash"]
    return user.get("password_hash", "")


async def refresh(refresh_token: str) -> dict:
    db = get_db()
    try:
        payload = decode_token(refresh_token, "refresh")
    except Exception:
        raise UnauthorizedException("Invalid refresh token")

    token_hash = _token_hash(refresh_token)
    session = await db.user_sessions.find_one({"token_hash": token_hash, "active": True})
    if not session:
        raise UnauthorizedException("Session expired, please login again")

    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if not user or user.get("status") != "active":
        raise UnauthorizedException("User no longer exists")

    return {"access_token": create_access_token(str(user["_id"]), user.get("role", "student")), "role": user.get("role", "student")}


async def logout(refresh_token: str) -> None:
    db = get_db()
    result = await db.user_sessions.delete_many({"token_hash": _token_hash(refresh_token)})
    auth_logger.info("Logout: removed %s sessions", result.deleted_count)


async def logout_all(user_id: str) -> None:
    db = get_db()
    await db.user_sessions.delete_many({"user_id": oid(user_id)})
    auth_logger.info("Logged out all sessions for %s", user_id)


async def list_sessions(user_id: str) -> list[dict]:
    db = get_db()
    sessions = db.user_sessions.find({"user_id": oid(user_id), "active": True}).sort("created_at", -1).limit(10)
    return [
        {
            "id": str(s["_id"]),
            "created_at": s.get("created_at").isoformat() if s.get("created_at") else None,
            "expires_at": s.get("expires_at").isoformat() if s.get("expires_at") else None,
        }
        async for s in sessions
    ]


async def revoke_session(user_id: str, session_id: str) -> None:
    db = get_db()
    await db.user_sessions.delete_one({"_id": oid(session_id), "user_id": oid(user_id)})


async def forgot_password(email: str) -> str:
    """Create a reset token and return it (mocked email delivery; return for response)."""
    db = get_db()
    user = await db.users.find_one({"email": sanitize_email(email)})
    if not user:
        raise NotFoundException("No account found with this email")

    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one(
        {
            "user_id": user["_id"],
            "token_hash": _token_hash(token),
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
            "used": False,
        }
    )
    auth_logger.info("Password reset token created for %s", sanitize_email(email))
    return token


async def reset_password(token: str, new_password: str) -> None:
    db = get_db()
    record = await db.password_reset_tokens.find_one({"token_hash": _token_hash(token), "used": False})
    if not record:
        raise BadRequestException("Invalid or expired reset token")
    if record["expires_at"] < datetime.utcnow():
        raise BadRequestException("Reset token has expired")

    user = await db.users.find_one({"_id": record["user_id"]})
    if not user:
        raise BadRequestException("User no longer exists")

    password_hash = hash_password(new_password)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": password_hash, "updated_at": datetime.utcnow()}})
    await db.user_sessions.delete_many({"user_id": user["_id"]})
    await db.password_reset_tokens.update_one({"_id": record["_id"]}, {"$set": {"used": True}})
    auth_logger.info("Password reset completed for %s", user.get("email"))


async def change_password(user_id: str, old_password: str, new_password: str) -> None:
    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        raise UnauthorizedException("User not found")
    password_hash = await _get_password_hash(user)
    if not verify_password(old_password, password_hash):
        raise BadRequestException("Current password is incorrect")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(new_password), "updated_at": datetime.utcnow()}})
    await db.user_sessions.delete_many({"user_id": user["_id"]})
    auth_logger.info("Password changed for %s", user.get("email"))


async def update_profile(user_id: str, payload: dict) -> dict:
    db = get_db()
    updates = {k: v for k, v in payload.items() if v is not None and k in {"name", "phone", "department_id", "semester", "roll_number", "bio", "address", "date_of_birth"}}

    if "name" in updates:
        await db.users.update_one({"_id": oid(user_id)}, {"$set": {"name": clean_text(updates["name"]), "updated_at": datetime.utcnow()}})

    set_fields: dict = {}
    if "phone" in updates:
        set_fields["phone"] = clean_text(updates["phone"]) or None
    if "department_id" in updates:
        dept = await db.departments.find_one({"_id": oid(updates["department_id"])})
        if not dept:
            raise BadRequestException("Invalid department")
        set_fields["department_id"] = dept["_id"]
    if "semester" in updates:
        set_fields["semester"] = updates["semester"]
    if "roll_number" in updates:
        set_fields["roll_number"] = clean_text(updates["roll_number"]) or None
    if "bio" in updates:
        set_fields["bio"] = clean_text(updates["bio"]) or None
    if "address" in updates:
        set_fields["address"] = clean_text(updates["address"]) or None
    if "date_of_birth" in updates:
        set_fields["date_of_birth"] = updates["date_of_birth"]

    if set_fields:
        set_fields["updated_at"] = datetime.utcnow()
        await db.students.update_one({"user_id": oid(user_id)}, {"$set": set_fields})
    return await get_profile(user_id)


async def get_profile(user_id: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        raise NotFoundException("User not found")
    student = await db.students.find_one({"user_id": oid(user_id)})
    profile = {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
    }
    if student:
        dept = await db.departments.find_one({"_id": student.get("department_id")}) if student.get("department_id") else None
        profile.update(
            {
                "student_id": str(student["_id"]),
                "semester": student.get("semester"),
                "roll_number": student.get("roll_number"),
                "phone": student.get("phone"),
                "photo_url": student.get("photo_url"),
                "department": dept.get("name") if dept else None,
                "department_id": str(student["department_id"]) if student.get("department_id") else None,
                "courses": student.get("courses", []),
                "status": student.get("status"),
                "bio": student.get("bio"),
                "address": student.get("address"),
                "date_of_birth": student.get("date_of_birth"),
            }
        )
    return profile


async def delete_account(user_id: str) -> None:
    db = get_db()
    await db.user_sessions.delete_many({"user_id": oid(user_id)})
    await db.chat_history.delete_many({"user_id": oid(user_id)})
    await db.chat_sessions.delete_many({"user_id": oid(user_id)})
    await db.notifications.delete_many({"user_id": oid(user_id)})
    await db.students.delete_one({"user_id": oid(user_id)})
    await db.users.delete_one({"_id": oid(user_id)})
    auth_logger.info("Account deleted: %s", user_id)


async def bootstrap_admin() -> None:
    """Create the default admin from env settings on first startup."""
    db = get_db()
    email = sanitize_email(settings.ADMIN_EMAIL)
    if await db.users.find_one({"email": email}):
        return
    user_id = str(ObjectId())
    await db.users.insert_one(
        {
            "_id": ObjectId(user_id),
            "name": settings.ADMIN_NAME,
            "email": email,
            "role": "admin",
            "password_hash": hash_password(settings.ADMIN_PASSWORD),
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
    )
    await db.admins.insert_one(
        {
            "user_id": ObjectId(user_id),
            "name": settings.ADMIN_NAME,
            "email": email,
            "role": "super_admin",
            "photo_url": None,
            "created_at": datetime.utcnow(),
        }
    )
    auth_logger.info("Bootstrap admin created: %s", email)
