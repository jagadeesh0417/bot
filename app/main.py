from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.config.settings import settings
from app.database.mongo import close_mongo_connection, connect_to_mongo
from app.middleware.error_handler import register_exception_handlers
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.setup import mount_static, register_global_middleware
from app.routers import (
    auth,
    chat,
    courses,
    dashboard,
    departments,
    events,
    faculty,
    feedback,
    gallery,
    knowledge,
    notices,
    notifications,
    placements,
    search,
    settings as settings_router,
    students,
    timetable,
    uploads,
)
from app.services.auth_service import bootstrap_admin
from app.utils.logger import app_logger, error_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await connect_to_mongo()
        await bootstrap_admin()
        app_logger.info("%s started in %s mode", settings.APP_NAME, settings.ENVIRONMENT)
    except Exception as exc:
        error_logger.exception("Startup failed (is MongoDB running?): %s", exc)
    yield
    await close_mongo_connection()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description=(
        "CollegeAI – Intelligent College Assistant. Authentication, students, faculty, "
        "departments, courses, notices, events, placements, gallery, timetable, AI chatbot "
        "with knowledge base, global search, analytics and Cloudinary uploads."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

register_global_middleware(app)
app.add_middleware(RateLimitMiddleware)
register_exception_handlers(app)
mount_static(app)

for module_router in (
    auth.router,
    students.router,
    faculty.router,
    departments.router,
    courses.router,
    notices.router,
    events.router,
    placements.router,
    gallery.router,
    timetable.router,
    knowledge.router,
    chat.router,
    search.router,
    dashboard.router,
    uploads.router,
    feedback.router,
    notifications.router,
    settings_router.router,
):
    app.include_router(module_router)


@app.get("/", include_in_schema=False)
async def index():
    index_path = Path(settings.TEMPLATES_DIR) / "index.html"
    return FileResponse(index_path) if index_path.exists() else {"detail": "CollegeAI API is running. See /docs"}


@app.get("/{path:path}", include_in_schema=False)
async def spa_fallback(path: str):
    """Serve the SPA for unknown page paths; keep JSON 404 for unknown API paths."""
    if path.startswith("api/"):
        from starlette.exceptions import HTTPException

        raise HTTPException(status_code=404, detail="Not Found")
    index_path = Path(settings.TEMPLATES_DIR) / "index.html"
    return FileResponse(index_path) if index_path.exists() else {"detail": "Not Found"}


@app.get("/health", tags=["System"], summary="Health check")
async def health():
    from app.database.mongo import get_db

    mongo_ok = True
    try:
        import asyncio

        await asyncio.wait_for(get_db().command("ping"), timeout=2.0)
    except Exception:
        mongo_ok = False
    return {"status": "ok", "app": settings.APP_NAME, "mongo": "connected" if mongo_ok else "disconnected"}
