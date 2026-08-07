"""Rate limiting middleware (in-memory sliding window per client)."""
from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config.settings import settings
from app.models.base import RateLimitExceeded


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int | None = None):
        super().__init__(app)
        self.per_minute = per_minute or settings.RATE_LIMIT_PER_MINUTE
        self.window = 60.0
        self._buckets: dict[str, list[float]] = {}
        self._max_requests = self.per_minute * 10
        self._cleanup_at = time.monotonic() + 300

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/") and self.per_minute > 0:
            client = request.client.host if request.client else "unknown"
            key = f"{client}:{request.method}"
            now = time.monotonic()

            if now > self._cleanup_at:
                self._buckets = {k: v for k, v in self._buckets.items() if v and v[-1] > now - 300}
                self._cleanup_at = now + 300

            hits = self._buckets.setdefault(key, [])
            hits[:] = [t for t in hits if now - t < self.window]

            if len(hits) >= self._max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again later.", "code": "rate_limited"},
                    headers={"Retry-After": "60"},
                )
            hits.append(now)

        response = await call_next(request)
        return response
