from fastapi import APIRouter, Depends, Form, Request

from app.middleware.auth import get_current_user, require_student
from app.models.base import BadRequestException
from app.schemas.auth import (
    AdminRegisterRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", status_code=201, summary="Student registration")
async def register(payload: RegisterRequest):
    return await auth_service.register_student(payload, payload.remember_me)


@router.post("/register/admin", status_code=201, summary="Admin registration (public for bootstrapping)")
async def register_admin(payload: AdminRegisterRequest):
    return await auth_service.register_admin(payload)


@router.post("/login", summary="Login (student or admin)")
async def login(payload: LoginRequest):
    return await auth_service.login(payload.email, payload.password, payload.remember_me)


@router.post("/refresh", summary="Get new access token from refresh token")
async def refresh(payload: RefreshRequest):
    return await auth_service.refresh(payload.refresh_token)


@router.post("/logout", status_code=204, summary="Logout (revoke refresh token)")
async def logout(payload: RefreshRequest):
    await auth_service.logout(payload.refresh_token)


@router.post("/forgot-password", summary="Request password reset link")
async def forgot_password(payload: ForgotPasswordRequest):
    token = await auth_service.forgot_password(payload.email)
    return {"success": True, "detail": "Reset token generated", "reset_token": token}


@router.post("/reset-password", summary="Reset password with token")
async def reset_password(payload: ResetPasswordRequest):
    await auth_service.reset_password(payload.token, payload.new_password)
    return {"success": True, "detail": "Password has been reset successfully"}


@router.get("/me", summary="Get current profile")
async def me(current_user=Depends(get_current_user)):
    return await auth_service.get_profile(current_user["user_id"])


@router.patch("/me", summary="Update profile")
async def update_me(payload: UpdateProfileRequest, current_user=Depends(require_student())):
    return await auth_service.update_profile(current_user["user_id"], payload.model_dump(exclude_unset=True))


@router.post("/change-password", summary="Change password")
async def change_password(payload: ChangePasswordRequest, current_user=Depends(get_current_user)):
    await auth_service.change_password(current_user["user_id"], payload.old_password, payload.new_password)
    return {"success": True, "detail": "Password changed successfully"}


@router.get("/sessions", summary="List active sessions")
async def sessions(current_user=Depends(get_current_user)):
    return await auth_service.list_sessions(current_user["user_id"])


@router.delete("/sessions/{session_id}", summary="Revoke a session")
async def revoke_session(session_id: str, current_user=Depends(get_current_user)):
    await auth_service.revoke_session(current_user["user_id"], session_id)
    return {"success": True, "detail": "Session revoked"}


@router.delete("/me", summary="Delete account permanently")
async def delete_account(current_user=Depends(require_student())):
    await auth_service.delete_account(current_user["user_id"])
    return {"success": True, "detail": "Account deleted"}


@router.post("/photo", summary="Upload profile photo")
async def upload_photo(request: Request, current_user=Depends(require_student())):
    form = await request.form()
    file = form.get("file")
    if not file:
        raise BadRequestException("No file provided")
    content = await file.read()
    from app.cloudinary.client import upload_file

    asset = await upload_file(content, file.filename or "photo.jpg", file.content_type or "image/jpeg", "image", "photos")
    from app.database.mongo import get_db
    from app.utils.helpers import oid
    from datetime import datetime

    db = get_db()
    await db.students.update_one(
        {"user_id": oid(current_user["user_id"])},
        {"$set": {"photo_url": asset["url"], "photo_public_id": asset["public_id"], "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "url": asset["url"]}
