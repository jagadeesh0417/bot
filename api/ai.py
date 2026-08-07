"""Vercel Python function: AI chatbot + knowledge base.

Vercel rewrites /api/chat/(.*) and /api/knowledge/(.*) here. The original
request path is preserved, so the FastAPI app below registers the existing
routers at their original prefixes and reuses the full AI engine.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.middleware.error_handler import register_exception_handlers
from app.routers import chat, knowledge
from app.database.mongo import get_db

ai_app = FastAPI(title="CollegeAI AI Service", docs_url=None, redoc_url=None, openapi_url=None)

register_exception_handlers(ai_app)


@ai_app.middleware("http")
async def ensure_db(request: Request, call_next):
    try:
        await get_db().command("ping")
    except Exception:
        pass
    return await call_next(request)


ai_app.include_router(chat.router)
ai_app.include_router(knowledge.router)


@ai_app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(status_code=404, content={"success": False, "detail": "Not Found", "code": "http_error"})


from mangum import Mangum

handler = Mangum(ai_app, lifespan="off")
