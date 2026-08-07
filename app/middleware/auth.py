"""FastAPI dependencies: current user resolution and role guards."""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, Request
from jwt import InvalidTokenError

from bson import ObjectId

from app.authentication.security import decode_token
from app.database.mongo import get_db
from app.models.base import ForbiddenException, UnauthorizedException
from app.utils.helpers import oid


async def get_current_user(request: Request):
    """Resolve the authenticated user (student or admin) from the JWT."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise UnauthorizedException("Missing bearer token")
    token = auth.split(" ", 1)[1]

    try:
        payload = decode_token(token, "access")
    except InvalidTokenError as exc:
        raise UnauthorizedException("Invalid or expired token") from exc

    user_id = payload.get("sub")
    role = payload.get("role", "student")
    db = get_db()

    if role == "admin":
        admin = await db.admins.find_one({"user_id": oid(user_id)})
        if not admin:
            raise UnauthorizedException("Admin account not found")
        return {"user_id": user_id, "role": "admin", "profile": admin, "name": admin.get("name")}

    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        raise UnauthorizedException("User not found")
    student = await db.students.find_one({"user_id": oid(user_id)})
    profile = student or {}
    return {
        "user_id": user_id,
        "role": "student",
        "profile": profile,
        "email": user.get("email"),
        "name": user.get("name"),
    }


def require_roles(*roles: str) -> Callable:
    async def guard(current_user=Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise ForbiddenException("You do not have permission to access this resource")
        return current_user

    return guard


def require_admin():
    return require_roles("admin")


def require_student():
    return require_roles("student")


async def optional_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        return await get_current_user(request)
    except Exception:
        return None
