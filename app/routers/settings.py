from fastapi import APIRouter, Depends

from app.database.mongo import get_db
from app.middleware.auth import require_admin
from app.schemas.modules import SettingsUpdate
from app.utils.helpers import clean_text

router = APIRouter(prefix="/api/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "college_name": "CollegeAI University",
    "tagline": "Empowering students with intelligence",
    "logo_url": "",
    "contact_email": "info@college.edu",
    "contact_phone": "+91 00000 00000",
    "address": "",
    "maintenance_mode": False,
    "welcome_message": "Welcome to CollegeAI! Ask me anything about your college.",
}


async def get_settings_doc(db):
    doc = await db.settings.find_one({"_id": "main"})
    if not doc:
        await db.settings.insert_one({"_id": "main", **DEFAULT_SETTINGS})
        return {**DEFAULT_SETTINGS}
    merged = {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k != "_id"}}
    return merged


@router.get("", summary="Public college settings")
async def get_settings():
    db = get_db()
    return await get_settings_doc(db)


@router.patch("", summary="Update settings (admin)", dependencies=[Depends(require_admin())])
async def update_settings(payload: SettingsUpdate):
    db = get_db()
    data = payload.model_dump(exclude_unset=True)
    for field in ("college_name", "tagline", "address", "welcome_message"):
        if field in data and data[field] is not None:
            data[field] = clean_text(data[field])
    await db.settings.update_one({"_id": "main"}, {"$set": data}, upsert=True)
    return await get_settings_doc(db)
