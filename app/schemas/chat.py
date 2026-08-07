from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    language: str = Field(default="en", max_length=10)


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    sources: list[dict] = Field(default_factory=list)
    response_time_ms: int


class SessionRename(BaseModel):
    title: str = Field(min_length=1, max_length=150)
