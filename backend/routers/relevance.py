# backend/routers/relevance.py
"""
相关性评估端点
Relevance assessment endpoint.

POST /api/sessions/{session_id}/relevance
  → 获取/生成所有线程摘要，一次 LLM 调用评估与主线相关性
  → Fetch/generate thread summaries, assess relevance in one LLM call

响应格式 / Response format:
  [{"thread_id": "uuid", "selected": true, "reason": "..."}]
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

from dependencies.auth import get_current_user
from services.llm_client import assess_relevance, summarize

logger = logging.getLogger(__name__)
router = APIRouter()


async def _db(fn):
    """同步 Supabase 调用包入线程池 / Wrap synchronous Supabase call in thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


async def _get_summary_or_generate(thread_id: str, sb) -> str:
    """
    读取线程摘要缓存；缺失时从最近 10 条消息生成并写库。
    Read cached summary; generate from last 10 messages and cache if missing.
    """
    # 检查缓存 / Check cache
    cached = await _db(
        lambda: sb.table("thread_summaries")
        .select("summary")
        .eq("thread_id", thread_id)
        .maybe_single()
        .execute()
    )
    if cached and cached.data and cached.data.get("summary"):
        return cached.data["summary"]

    # 缓存缺失：从消息生成 / Cache miss: generate from messages
    msgs_res = await _db(
        lambda: sb.table("messages")
        .select("role, content")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    messages = list(reversed(msgs_res.data or []))
    if not messages:
        return ""

    lines = [f"{'用户' if m['role'] == 'user' else 'AI'}：{m['content']}" for m in messages]
    summary = await summarize("\n".join(lines), 200)

    # 写入缓存 / Write to cache
    await _db(
        lambda: sb.table("thread_summaries").upsert({
            "thread_id": thread_id,
            "summary": summary,
            "token_budget": 200,
        }).execute()
    )
    return summary


@router.post("/sessions/{session_id}/relevance")
async def relevance(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    评估 session 下所有子线程与主线的相关性。
    Assess relevance of all sub-threads to the main thread for this session.
    """
    _user_id, sb = auth

    # 1. 确认 session 存在 / Confirm session exists
    session_res = await _db(
        lambda: sb.table("sessions")
        .select("id")
        .eq("id", str(session_id))
        .maybe_single()
        .execute()
    )
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # 2. 获取所有线程 / Fetch all threads
    threads_res = await _db(
        lambda: sb.table("threads")
        .select("id, title, anchor_text, depth")
        .eq("session_id", str(session_id))
        .order("created_at")
        .execute()
    )
    threads = threads_res.data or []

    main_thread = next((t for t in threads if t["depth"] == 0), None)
    sub_threads = [t for t in threads if t["depth"] > 0]

    if not main_thread or not sub_threads:
        return []

    # 3. 串行获取/生成摘要（避免 Supabase httpx 客户端并发竞争）
    #    Fetch/generate summaries sequentially to avoid Supabase httpx contention
    main_summary = await _get_summary_or_generate(main_thread["id"], sb)

    thread_inputs = []
    for t in sub_threads:
        summary = await _get_summary_or_generate(t["id"], sb)
        thread_inputs.append({
            "thread_id": t["id"],
            "title": t.get("title") or t.get("anchor_text") or "",
            "summary": summary,
        })

    # 4. 一次 LLM 调用评估相关性 / Single LLM call to assess relevance
    result = await assess_relevance(main_summary, thread_inputs)
    return result
