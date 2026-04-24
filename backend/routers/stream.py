# backend/routers/stream.py
"""
SSE streaming chat endpoint.

POST /api/threads/{thread_id}/chat
  → Save the user message, build context, and stream the AI response
       data: {"type": "ping"}
       data: {"type": "status", "text": "..."}
       data: {"type": "chunk", "content": "..."}
       data: {"type": "done", "message_id": "..."}
       data: {"type": "error", "message": "..."}
       data: {"type": "thread_title", "thread_id": "...", "title": "..."}

Anonymous user quota:
    Anonymous users: 20 turns total across all threads in the session.
    Exceed → HTTP 402 + structured code; frontend catches and prompts sign-in.
"""

import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from dependencies.auth import CurrentUser, get_current_user_full
from models.message import ChatRequest
from services.stream_manager import ANON_TURN_LIMIT, stream_and_save

router = APIRouter()


async def _db(fn):
    """
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.post("/threads/{thread_id}/chat")
async def chat(
    thread_id: uuid.UUID,
    body: ChatRequest,
    user: CurrentUser = Depends(get_current_user_full),
):
    """
    Send a message to the specified thread and return a streaming SSE AI response.

    Upfront checks: thread existence + anonymous quota.
    """
    sb = user.sb

    # RLS: if the thread does not belong to this user, maybe_single() returns None -> 404
    # Also fetch depth/title/session_id to spare stream_manager another DB request (saves one round-trip)
    thread_res = await _db(lambda: (
        sb.table("threads")
        .select("id, depth, title, session_id")
        .eq("id", str(thread_id))
        .maybe_single()
        .execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    thread_meta = thread_res.data
    session_id: str | None = thread_meta.get("session_id")

    # Anonymous users: fetch session.turn_count; 402 at the cap.
    if user.is_anonymous and session_id:
        session_res = await _db(lambda: (
            sb.table("sessions")
            .select("turn_count")
            .eq("id", session_id)
            .maybe_single()
            .execute()
        ))
        turn_count = (session_res.data or {}).get("turn_count", 0) if session_res else 0
        if turn_count >= ANON_TURN_LIMIT:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "anon_quota_exceeded",
                    "limit": ANON_TURN_LIMIT,
                    "message": (
                        "已达到免费试用上限，登录后继续对话（已有消息会保留）。"
                        " / Free-trial limit reached. Sign in to continue — your conversation will be kept."
                    ),
                },
            )

    # stream_and_save writes messages with service_role internally (background-task mode; bypassing RLS is intentional)
    return StreamingResponse(
        stream_and_save(
            str(thread_id),
            body.content,
            body.attachment_filename,
            thread_meta=thread_meta,
            session_id=session_id,
            lang=body.lang,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
