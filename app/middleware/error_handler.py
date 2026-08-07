"""Global exception handlers producing consistent error responses."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jwt import ExpiredSignatureError, InvalidTokenError
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.models.base import APIException
from app.utils.logger import error_logger


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIException)
    async def api_exception_handler(request: Request, exc: APIException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "detail": str(exc.detail), "code": "http_error"},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        errors = []
        for err in exc.errors():
            loc = ".".join(str(x) for x in err.get("loc", []) if x != "body")
            errors.append({"field": loc or "body", "message": err.get("msg", "Invalid value")})
        return JSONResponse(
            status_code=422,
            content={"success": False, "detail": "Validation failed", "code": "validation_error", "errors": errors},
        )

    @app.exception_handler(ExpiredSignatureError)
    async def expired_token_handler(request: Request, exc: ExpiredSignatureError):
        return JSONResponse(status_code=401, content={"success": False, "detail": "Token expired", "code": "token_expired"})

    @app.exception_handler(InvalidTokenError)
    async def invalid_token_handler(request: Request, exc: InvalidTokenError):
        return JSONResponse(status_code=401, content={"success": False, "detail": "Invalid token", "code": "invalid_token"})

    @app.exception_handler(DuplicateKeyError)
    async def duplicate_key_handler(request: Request, exc: DuplicateKeyError):
        return JSONResponse(
            status_code=409,
            content={"success": False, "detail": "Record already exists with the same unique value", "code": "conflict"},
        )

    @app.exception_handler(PyMongoError)
    async def mongo_error_handler(request: Request, exc: PyMongoError):
        error_logger.error("MongoDB error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": "Database error occurred", "code": "database_error"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        error_logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": "Internal server error", "code": "internal_error"},
        )
