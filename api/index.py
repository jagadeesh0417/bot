"""Vercel serverless entry point for the CollegeAI FastAPI app.

Uses a lightweight ASGI middleware to ensure MongoDB connection and the
bootstrap admin exist before the first request on each cold start, since
serverless platforms do not guarantee lifespan startup events.
"""
from mangum import Mangum

from app.main import app
from app.utils.logger import app_logger, error_logger


class EnsureReadyMiddleware:
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app
        self._ready = False

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not self._ready:
            try:
                from app.database.mongo import connect_to_mongo
                from app.services.auth_service import bootstrap_admin

                await connect_to_mongo()
                await bootstrap_admin()
                app_logger.info("Serverless database ready")
            except Exception as exc:
                error_logger.error("Serverless startup skipped: %s", exc)
            finally:
                self._ready = True
        await self.asgi_app(scope, receive, send)


handler = Mangum(EnsureReadyMiddleware(app), lifespan="off")
