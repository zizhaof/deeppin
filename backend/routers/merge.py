# backend/routers/merge.py
"""
Merge output endpoint.

POST /api/sessions/{session_id}/merge
  → Fetches all sub-thread summaries for the session and streams a merged report

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

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from dependencies.auth import get_current_user
from services.llm_client import merge_threads

# Merge group min TPM = 10K (kimi-k2); reserve ~200 tokens for system + ~1K for output → 8K budget
_CONTENT_BUDGET_TOKENS = 8_000
# Mixed Chinese/English: ~1.5 token per CJK char, ~0.25 per ASCII; overall ~2 chars/token
_CHARS_PER_TOKEN = 2

logger = logging.getLogger(__name__)

router = APIRouter()


def _sse(event_type: str, data: dict) -> str:
    """Serialize an event to SSE format."""
    return f"data: {json.dumps({'type': event_type, **data}, ensure_ascii=False)}\n\n"


async def _db(fn):
    """
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


class MergeRequest(BaseModel):
    format: str = "free"  # "free" | "bullets" | "structured" | "custom" | "transcript"
    thread_ids: list[str] | None = None  # None = all; populated = merge only the given threads
    custom_prompt: str | None = None  # Used only when format="custom"
    # Current frontend UI locale; forces output language of the merged report and transcript labels.
    lang: str | None = None

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed = {"free", "bullets", "structured", "custom", "transcript"}
        if v not in allowed:
            raise ValueError(f"format 必须是 {allowed} 之一 / format must be one of {allowed}")
        return v


@router.post("/sessions/{session_id}/merge")
async def merge(session_id: uuid.UUID, body: MergeRequest, auth=Depends(get_current_user)):
    """
    Merge all sub-thread content for the session; stream back a structured report.

    Returns 400 if the session has no sub-threads.
    """
    _user_id, sb = auth

    # Check session existence
    session_res = await _db(
        lambda: sb.table("sessions").select("id").eq("id", str(session_id)).maybe_single().execute()
    )
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session 不存在 / Session not found")

    async def generate():
        yield _sse("ping", {})

        try:
            yield _sse("status", {"text": "正在整理探索内容… / Gathering threads…"})

            #    Fetch sub-threads, optionally filtered by thread_ids
            query = (
                sb.table("threads")
                .select("id, title, anchor_text, depth")
                .eq("session_id", str(session_id))
                .gt("depth", 0)
                .order("created_at")
            )
            if body.thread_ids is not None:
                query = query.in_("id", body.thread_ids)
            threads_res = await _db(lambda: query.execute())
            threads = threads_res.data or []

            if not threads:
                yield _sse("error", {"message": "该 session 下还没有子线程（插针）/ No sub-threads (pins) found for this session"})
                return

            yield _sse("status", {"text": f"找到 {len(threads)} 个探索角度，正在读取内容… / Found {len(threads)} pins, reading content…"})

            #    Fetch main thread + sub-thread content; allocate token budget by weight
            # Main thread weight 2, each sub-thread weight 1
            total_slots = 2 + len(threads)  # main gets 2 slots
            chars_per_slot = _CONTENT_BUDGET_TOKENS * _CHARS_PER_TOKEN // max(total_slots, 1)
            main_char_budget = chars_per_slot * 2
            sub_char_budget = chars_per_slot

            async def fetch_content(thread_id: str, char_budget: int) -> str:
                """
                Fetch full text; truncate if over budget (no summarizer call to avoid TPM limits).
                The merge model group has TPM ≥ 10K and can handle truncated text directly.
                """
                msgs_res = await _db(
                    lambda: sb.table("messages")
                    .select("role, content")
                    .eq("thread_id", thread_id)
                    .order("created_at")
                    .execute()
                )
                messages = msgs_res.data or []
                lines = [
                    f"{'用户' if m['role'] == 'user' else 'AI'}：{m['content']}"
                    for m in messages
                ]
                full_content = "\n".join(lines)
                if len(full_content) <= char_budget:
                    return full_content
                return full_content[:char_budget] + "\n…（内容过长，已截断 / Content truncated）"

            # Fetch main thread content
            main_thread_res = await _db(
                lambda: sb.table("threads")
                .select("id")
                .eq("session_id", str(session_id))
                .eq("depth", 0)
                .maybe_single()
                .execute()
            )
            main_content = ""
            if main_thread_res and main_thread_res.data:
                main_content = await fetch_content(main_thread_res.data["id"], main_char_budget)

            # Fetch sub-thread content sequentially
            threads_data = []
            for t in threads:
                content = await fetch_content(t["id"], sub_char_budget)
                if content.strip() or (t.get("anchor_text") or "").strip():
                    threads_data.append({
                        "title": t.get("title") or "",
                        "anchor": t.get("anchor_text") or "",
                        "content": content,
                    })

            if not threads_data:
                yield _sse("error", {"message": "子线程均无内容，无法合并 / Sub-threads have no content to merge"})
                return

            yield _sse("status", {"text": "正在生成合并报告… / Generating merged report…"})

            # Stream the merged report
            async for chunk in merge_threads(
                list(threads_data),
                main_content=main_content,
                format_type=body.format,
                custom_prompt=body.custom_prompt,
                lang=body.lang,
            ):
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
