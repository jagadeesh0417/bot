from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.chatbot.engine import (
    delete_history_entry,
    delete_session,
    export_history,
    get_history,
    handle_message,
    list_sessions,
    rename_session,
    search_history,
)
from app.middleware.auth import require_student
from app.models.base import BadRequestException
from app.schemas.chat import ChatRequest, SessionRename

router = APIRouter(prefix="/api/chat", tags=["AI Chatbot"])


@router.post("", summary="Send a message to the chatbot")
async def chat(payload: ChatRequest, current_user=Depends(require_student())):
    if not payload.message.strip():
        raise BadRequestException("Message cannot be empty")
    return await handle_message(
        current_user["user_id"], payload.message, payload.session_id, payload.language
    )


@router.get("/sessions", summary="List chat sessions")
async def sessions(search: str | None = None, current_user=Depends(require_student())):
    items = await list_sessions(current_user["user_id"], search)
    return {"items": items, "total": len(items)}


@router.get("/sessions/{session_id}/messages", summary="Get messages of a session")
async def session_messages(session_id: str, limit: int = 50, current_user=Depends(require_student())):
    return {"items": await get_history(current_user["user_id"], session_id, limit), "total": 0}


@router.patch("/sessions/{session_id}", summary="Rename a session")
async def rename(session_id: str, payload: SessionRename, current_user=Depends(require_student())):
    session = await rename_session(current_user["user_id"], session_id, payload.title)
    return session


@router.delete("/sessions/{session_id}", status_code=204, summary="Delete a session and its messages")
async def remove_session(session_id: str, current_user=Depends(require_student())):
    await delete_session(current_user["user_id"], session_id)


@router.get("/history", summary="Search chat history")
async def history(
    q: str = "",
    page: int = 1,
    page_size: int = 20,
    current_user=Depends(require_student()),
):
    return await search_history(current_user["user_id"], q, page, page_size)


@router.delete("/history/{entry_id}", status_code=204, summary="Delete one chat message")
async def remove_message(entry_id: str, current_user=Depends(require_student())):
    await delete_history_entry(current_user["user_id"], entry_id)


@router.get("/export", summary="Export all chat history as JSON")
async def export(current_user=Depends(require_student())):
    data = await export_history(current_user["user_id"])
    return JSONResponse(content=data)
