# backend/routers/stream.py
"""
SSE 流式聊天端点
SSE streaming chat endpoint.

POST /api/threads/{thread_id}/chat
  → 保存用户消息，构建 context，流式推送 AI 回复
  → Save the user message, build context, and stream the AI response
  → SSE 事件格式 / SSE event format:
       data: {"type": "ping"}
       data: {"type": "status", "text": "..."}
       data: {"type": "chunk", "content": "..."}
       data: {"type": "done", "message_id": "..."}
       data: {"type": "error", "message": "..."}
       data: {"type": "thread_title", "thread_id": "...", "title": "..."}

匿名用户额度 / Anonymous user quota:
  - 匿名用户生命期累计 20 轮（所有线程加起来）
    Anonymous users: 20 turns total across all threads in the session.
  - 超出返回 402 + {code: "anon_quota_exceeded"}，前端捕捉后弹登录
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
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
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
    向指定线程发送消息，返回 SSE 流式 AI 回复。
    Send a message to the specified thread and return a streaming SSE AI response.

    前置检查：线程存在性 + 匿名额度。
    Upfront checks: thread existence + anonymous quota.
    """
    sb = user.sb

    # RLS: 若线程不属于该用户，maybe_single() 返回 None → 404
    # 同时取 depth/title/session_id，避免 stream_manager 再发一次 DB 请求（节省一次 round-trip）
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

    # 匿名用户：查 session.turn_count，达到上限就 402
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

    # stream_and_save 内部使用 service_role 写消息（背景任务模式，绕过 RLS 是预期行为）
    return StreamingResponse(
        stream_and_save(
            str(thread_id),
            body.content,
            body.attachment_filename,
            thread_meta=thread_meta,
            session_id=session_id,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
