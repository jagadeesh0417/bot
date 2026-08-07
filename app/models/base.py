"""Shared Pydantic helpers and custom exceptions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PyObjectId(str):
    """Pydantic-friendly wrapper for MongoDB ObjectIds as strings."""

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        from bson import ObjectId

        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str) and ObjectId.is_valid(v):
            return v
        raise ValueError(f"Invalid ObjectId: {v!r}")


class MongoModel(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, populate_by_name=True)


class APIException(Exception):
    """Base custom exception carrying an HTTP status."""

    def __init__(self, status_code: int, detail: str, code: str | None = None):
        self.status_code = status_code
        self.detail = detail
        self.code = code or "error"
        super().__init__(detail)


class NotFoundException(APIException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(404, detail, "not_found")


class UnauthorizedException(APIException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(401, detail, "unauthorized")


class ForbiddenException(APIException):
    def __init__(self, detail: str = "You do not have permission"):
        super().__init__(403, detail, "forbidden")


class BadRequestException(APIException):
    def __init__(self, detail: str = "Bad request"):
        super().__init__(400, detail, "bad_request")


class ConflictException(APIException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(409, detail, "conflict")


class RateLimitExceeded(APIException):
    def __init__(self, detail: str = "Rate limit exceeded. Try again later."):
        super().__init__(429, detail, "rate_limited")


class ValidationFailedException(APIException):
    def __init__(self, detail: Any):
        super().__init__(422, detail, "validation_error")
