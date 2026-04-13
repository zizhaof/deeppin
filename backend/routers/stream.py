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
"""

import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from dependencies.auth import get_current_user
from models.message import ChatRequest
from services.stream_manager import stream_and_save

router = APIRouter()


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.post("/threads/{thread_id}/chat")
async def chat(thread_id: uuid.UUID, body: ChatRequest, auth=Depends(get_current_user)):
    """
    向指定线程发送消息，返回 SSE 流式 AI 回复。
    Send a message to the specified thread and return a streaming SSE AI response.

    前置检查线程是否存在，不存在返回 404。
    Checks thread existence upfront; returns 404 if not found.
    """
    _user_id, sb = auth

    # RLS: 若线程不属于该用户，maybe_single() 返回 None → 404
    thread_res = await _db(lambda: (
        sb.table("threads").select("id").eq("id", str(thread_id)).maybe_single().execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    # stream_and_save 内部使用 service_role 写消息（背景任务模式，绕过 RLS 是预期行为）
    return StreamingResponse(
        stream_and_save(str(thread_id), body.content),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
