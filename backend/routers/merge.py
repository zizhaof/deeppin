# backend/routers/merge.py
"""
合并输出端点
Merge output endpoint.

POST /api/sessions/{session_id}/merge
  → 抓取 session 下所有子线程摘要，流式生成合并报告
  → Fetches all sub-thread summaries for the session and streams a merged report

SSE 事件格式 / SSE event format:
  data: {"type": "ping"}
  data: {"type": "status", "text": "..."}
  data: {"type": "chunk", "content": "..."}
  data: {"type": "done"}
  data: {"type": "error", "message": "..."}
"""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from db.supabase import get_supabase
from services.llm_client import merge_threads

logger = logging.getLogger(__name__)

router = APIRouter()


def _sse(event_type: str, data: dict) -> str:
    """将事件序列化为 SSE 格式 / Serialize an event to SSE format."""
    return f"data: {json.dumps({'type': event_type, **data}, ensure_ascii=False)}\n\n"


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


class MergeRequest(BaseModel):
    format: str = "free"  # "free" | "bullets" | "structured"

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed = {"free", "bullets", "structured"}
        if v not in allowed:
            raise ValueError(f"format 必须是 {allowed} 之一 / format must be one of {allowed}")
        return v


@router.post("/sessions/{session_id}/merge")
async def merge(session_id: uuid.UUID, body: MergeRequest):
    """
    合并 session 下所有子线程内容，流式返回结构化报告。
    Merge all sub-thread content for the session; stream back a structured report.

    若 session 下没有子线程，返回 400。
    Returns 400 if the session has no sub-threads.
    """
    sb = get_supabase()

    # 1. 查 session 是否存在 / Check session existence
    session_res = await _db(
        lambda: sb.table("sessions").select("id").eq("id", str(session_id)).maybe_single().execute()
    )
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session 不存在 / Session not found")

    async def generate():
        yield _sse("ping", {})

        try:
            yield _sse("status", {"text": "正在整理探索内容… / Gathering threads…"})

            # 2. 抓取该 session 下所有子线程（depth > 0）
            #    Fetch all sub-threads for this session (depth > 0)
            threads_res = await _db(
                lambda: sb.table("threads")
                .select("id, title, anchor_text, depth")
                .eq("session_id", str(session_id))
                .gt("depth", 0)
                .order("created_at")
                .execute()
            )
            threads = threads_res.data or []

            if not threads:
                yield _sse("error", {"message": "该 session 下还没有子线程（插针）/ No sub-threads (pins) found for this session"})
                return

            yield _sse("status", {"text": f"找到 {len(threads)} 个探索角度，正在读取内容… / Found {len(threads)} pins, reading content…"})

            # 3. 并发获取每条子线程的摘要（优先从缓存，否则取最近消息）
            #    Concurrently fetch each sub-thread's summary (cache first, fall back to recent messages)
            async def get_thread_content(thread: dict) -> dict:
                tid = thread["id"]

                # 先查 thread_summaries 缓存 / Check thread_summaries cache first
                summary_res = await _db(
                    lambda: sb.table("thread_summaries")
                    .select("summary")
                    .eq("thread_id", tid)
                    .maybe_single()
                    .execute()
                )
                if summary_res and summary_res.data and summary_res.data.get("summary"):
                    return {
                        "title": thread.get("title") or "",
                        "anchor": thread.get("anchor_text") or "",
                        "content": summary_res.data["summary"],
                    }

                # 缓存缺失：取最近 10 条消息拼接为纯文本
                # Cache miss: concatenate the most recent 10 messages as plain text
                msgs_res = await _db(
                    lambda: sb.table("messages")
                    .select("role, content")
                    .eq("thread_id", tid)
                    .order("created_at", desc=True)
                    .limit(10)
                    .execute()
                )
                messages = list(reversed(msgs_res.data or []))
                lines = []
                for m in messages:
                    label = "用户" if m["role"] == "user" else "AI"
                    lines.append(f"{label}：{m['content']}")
                return {
                    "title": thread.get("title") or "",
                    "anchor": thread.get("anchor_text") or "",
                    "content": "\n".join(lines),
                }

            threads_data = await asyncio.gather(*[get_thread_content(t) for t in threads])
            # 过滤掉没有任何内容的空线程
            # Filter out threads with no content at all
            threads_data = [t for t in threads_data if t["content"].strip() or t["anchor"].strip()]

            if not threads_data:
                yield _sse("error", {"message": "子线程均无内容，无法合并 / Sub-threads have no content to merge"})
                return

            yield _sse("status", {"text": "正在生成合并报告… / Generating merged report…"})

            # 4. 流式生成合并报告 / Stream the merged report
            async for chunk in merge_threads(list(threads_data), format_type=body.format):
                yield _sse("chunk", {"content": chunk})

            yield _sse("done", {})

        except Exception as exc:
            logger.exception("合并失败（session=%s）/ Merge failed (session=%s)", session_id, session_id)
            yield _sse("error", {"message": f"合并失败 / Merge failed: {exc}"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
