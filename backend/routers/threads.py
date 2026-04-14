# backend/routers/threads.py
"""
Thread 路由
Thread router — create and manage threads (pins).

端点列表 / Endpoints:
  POST /api/threads                          创建线程（主线或子线程/插针）
                                             Create a thread (main or sub-thread/pin)
  GET  /api/threads/{thread_id}/suggest      获取子线程建议追问（优先返回 DB 缓存）
                                             Get suggested follow-up questions (prefers DB cache)
  POST /api/threads/{thread_id}/autostart    自动向子线程发送第一条消息（流式）
                                             Auto-send the first message to a sub-thread (streaming)
  GET  /api/threads/{thread_id}/messages     获取线程消息历史
                                             Get the thread's message history
"""

import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

from db.supabase import get_supabase
from dependencies.auth import get_current_user
from models.thread import CreateThreadRequest, Thread
from models.message import ChatRequest
from services.llm_client import generate_title_and_suggestions
from services.stream_manager import stream_and_save

router = APIRouter()


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.post("/threads", response_model=Thread, status_code=201)
async def create_thread(body: CreateThreadRequest, auth=Depends(get_current_user)):
    """
    创建子线程（插针）。
    Create a sub-thread (pin).

    depth 由前端直接传入（省去 DB 查询）；未传时查父线程后 +1。
    depth is passed directly from the frontend (no DB round-trip);
    if omitted, it is derived by querying the parent thread and adding 1.

    LLM 标题和建议追问在后台异步生成，不阻塞本端点响应。
    LLM title and suggested questions are generated asynchronously in the background;
    they do not block this endpoint's response.
    """
    _user_id, sb = auth

    # 计算嵌套深度 / Calculate nesting depth
    if body.depth is not None:
        # 前端直接传入，无需查库（最优路径）
        # Provided directly by the frontend; no DB query needed (optimal path)
        depth = body.depth
    elif body.parent_thread_id:
        # 前端未传 depth，查父线程 / Frontend did not send depth; query the parent thread
        parent_res = await _db(lambda: (
            sb.table("threads")
            .select("depth")
            .eq("id", str(body.parent_thread_id))
            .single()
            .execute()
        ))
        if not parent_res.data:
            raise HTTPException(status_code=404, detail="父线程不存在 / Parent thread not found")
        depth = parent_res.data["depth"] + 1
    else:
        depth = 1  # 无父线程时默认深度 1 / Default depth 1 when no parent thread

    # 写库后立即返回，LLM 在后台异步生成标题/建议
    # Write to DB and return immediately; LLM generates title/suggestions in the background
    try:
        thread_res = await _db(lambda: sb.table("threads").insert({
            "session_id": str(body.session_id),
            "parent_thread_id": str(body.parent_thread_id) if body.parent_thread_id else None,
            "anchor_text": body.anchor_text,
            "anchor_message_id": str(body.anchor_message_id) if body.anchor_message_id else None,
            "anchor_start_offset": body.anchor_start_offset,
            "anchor_end_offset": body.anchor_end_offset,
            "side": body.side,
            "title": None,        # 后台异步填充 / Filled asynchronously in the background
            "suggestions": None,  # 后台异步填充 / Filled asynchronously in the background
            "depth": depth,
        }).execute())
    except Exception as exc:
        logger.exception("threads insert 失败 / threads insert failed")
        raise HTTPException(status_code=500, detail=f"创建线程失败 / Failed to create thread: {exc}")

    if not thread_res.data:
        raise HTTPException(status_code=500, detail="创建线程失败: insert 返回空 / Failed to create thread: insert returned empty")

    thread_data = thread_res.data[0]
    thread_id_str = thread_data["id"]

    # 有锚点时，后台生成标题 + 建议追问并回写 DB
    # When there is anchor text, generate title + suggestions in the background and write back to DB
    if body.anchor_text:
        asyncio.create_task(
            _generate_and_patch(
                thread_id_str,
                body.anchor_text,
                str(body.anchor_message_id) if body.anchor_message_id else None,
            )
        )

    return thread_data


async def _generate_and_patch(
    thread_id: str,
    anchor_text: str,
    anchor_message_id: str | None,
) -> None:
    """
    后台任务：取锚点所在的完整消息作为背景 → 生成标题和建议追问 → 回写 DB。
    Background task: fetch the full message containing the anchor → generate title and suggestions → write back to DB.

    失败静默处理，不影响子线程正常使用（标题/建议可为空）。
    Failures are silent; they do not affect normal sub-thread use (title/suggestions may be empty).
    """
    # 取锚点所在的完整消息，帮助 LLM 在完整段落语境中理解锚点含义
    # Fetch the full message containing the anchor so the LLM understands it in its paragraph context
    context_summary = ""
    if anchor_message_id:
        try:
            sb = get_supabase()
            msg_res = await _db(lambda: (
                sb.table("messages")
                .select("content")
                .eq("id", str(anchor_message_id))
                .maybe_single()
                .execute()
            ))
            if msg_res and msg_res.data:
                context_summary = msg_res.data["content"]
        except Exception:
            logger.warning("_generate_and_patch 取锚点消息失败（thread=%s）/ Failed to fetch anchor message (thread=%s)", thread_id, thread_id)

    try:
        title, suggestions = await generate_title_and_suggestions(anchor_text, context_summary)
    except Exception:
        # LLM 失败：截取锚点前20字作为标题，建议追问为空
        # LLM failed: use first 20 chars of anchor as title; no suggestions
        title = anchor_text[:20]
        suggestions = []

    try:
        sb = get_supabase()
        await _db(lambda: sb.table("threads").update({
            "title": title,
            "suggestions": suggestions or None,
        }).eq("id", thread_id).execute())
    except Exception:
        logger.exception("标题/建议回写失败（thread=%s）/ Title/suggestions write-back failed (thread=%s)", thread_id, thread_id)


@router.get("/threads/{thread_id}/suggest")
async def suggest_questions(thread_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    返回子线程的建议追问（最多 3 个）。
    Return suggested follow-up questions for a sub-thread (up to 3).

    优先返回创建时已写入 DB 的缓存，避免重复 LLM 调用。
    Prefers the DB-cached suggestions written at creation time to avoid redundant LLM calls.

    缓存缺失时（历史线程兜底）：等待 300ms 后再查一次（_generate_and_patch 通常已完成），
    仍缺失则实时生成并回写。
    On cache miss (fallback for historical threads): wait 300ms and re-check
    (_generate_and_patch is usually done by then); if still missing, generate and write back in real time.
    """
    _user_id, sb = auth

    thread_res = await _db(lambda: (
        sb.table("threads")
        .select("anchor_text, parent_thread_id, suggestions")
        .eq("id", str(thread_id))
        .maybe_single()
        .execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    thread = thread_res.data

    # 命中缓存直接返回 / Return cached suggestions immediately if available
    cached = thread.get("suggestions")
    if cached:
        try:
            questions = cached if isinstance(cached, list) else json.loads(cached)
            return {"questions": questions[:3]}
        except Exception:
            pass  # 缓存损坏，走实时生成 / Cache corrupt; fall through to real-time generation

    # _generate_and_patch 可能仍在后台跑，等 300ms 再查一次
    # _generate_and_patch may still be running; wait 300ms and re-check
    await asyncio.sleep(0.3)
    thread_res2 = await _db(lambda: (
        sb.table("threads")
        .select("suggestions")
        .eq("id", str(thread_id))
        .maybe_single()
        .execute()
    ))
    cached2 = (thread_res2.data or {}).get("suggestions") if thread_res2 else None
    if cached2:
        try:
            questions = cached2 if isinstance(cached2, list) else json.loads(cached2)
            return {"questions": questions[:3]}
        except Exception:
            pass

    # 缓存仍缺失：实时生成（历史线程兜底）
    # Cache still missing: generate in real time (fallback for historical threads)
    anchor = thread.get("anchor_text") or ""
    context_summary = ""
    if thread.get("anchor_message_id"):
        try:
            msg_res = await _db(lambda: (
                sb.table("messages")
                .select("content")
                .eq("id", str(thread["anchor_message_id"]))
                .maybe_single()
                .execute()
            ))
            if msg_res and msg_res.data:
                context_summary = msg_res.data["content"]
        except Exception:
            pass

    try:
        _, questions = await generate_title_and_suggestions(anchor, context_summary)
    except Exception:
        short = anchor[:10]
        questions = [
            f"请详细解释「{short}」",
            f"「{short}」有哪些应用场景？",
            f"「{short}」的优缺点是什么？",
        ]

    # 回写缓存，避免下次再生成 / Write back to cache to avoid regenerating next time
    try:
        await _db(lambda: sb.table("threads").update({"suggestions": questions}).eq("id", str(thread_id)).execute())
    except Exception:
        pass

    return {"questions": questions[:3]}


@router.post("/threads/{thread_id}/autostart")
async def autostart_thread(thread_id: uuid.UUID, body: ChatRequest, auth=Depends(get_current_user)):
    """
    自动向子线程发送第一条消息（建议问题），流式返回 AI 回复。
    Auto-send the first message (a suggested question) to a sub-thread; stream back the AI reply.

    SSE 格式与 /api/threads/{id}/chat 完全一致。
    SSE format is identical to /api/threads/{id}/chat.
    """
    _user_id, sb = auth

    # 验证线程存在且属于当前用户（RLS 自动过滤）
    thread_res = await _db(lambda: (
        sb.table("threads").select("id").eq("id", str(thread_id)).maybe_single().execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    return StreamingResponse(
        stream_and_save(str(thread_id), body.content),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲 / Disable Nginx buffering
        },
    )


@router.get("/threads/{thread_id}/messages")
async def get_messages(thread_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    获取指定线程的消息历史，按创建时间升序排列。
    Get the message history for the specified thread in ascending chronological order.
    """
    _user_id, sb = auth

    # 验证线程存在（maybe_single 在无结果时返回 None 而不是抛异常）
    # Verify thread exists; maybe_single returns None on no match instead of raising
    thread_res = await _db(lambda: (
        sb.table("threads")
        .select("id")
        .eq("id", str(thread_id))
        .maybe_single()
        .execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    messages_res = await _db(lambda: (
        sb.table("messages")
        .select("*")
        .eq("thread_id", str(thread_id))
        .order("created_at")
        .execute()
    ))

    return messages_res.data or []
