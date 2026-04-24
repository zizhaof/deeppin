# backend/routers/threads.py
"""
Thread router — create and manage threads (pins).

Endpoints:
  POST   /api/threads                          Create a thread (main thread or sub-thread/pin)
  GET    /api/threads/{thread_id}/suggest      Get suggested follow-ups for a sub-thread (DB cache preferred)
  GET    /api/threads/{thread_id}/messages     Fetch a thread's message history
  POST   /api/threads/{thread_id}/messages     Write a message directly (no AI trigger; used to save merge results)
  DELETE /api/threads/{thread_id}              Delete the thread and all descendants (CASCADE)
"""

import asyncio
import json
import logging
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

from db.supabase import get_supabase
from dependencies.auth import get_current_user
from models.thread import CreateThreadRequest, Thread
from services.llm_client import generate_title_and_suggestions

router = APIRouter()


async def _db(fn):
    """
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.post("/threads", response_model=Thread, status_code=201)
async def create_thread(body: CreateThreadRequest, auth=Depends(get_current_user)):
    """
    Create a sub-thread (pin).

    depth is passed directly from the frontend (no DB round-trip);
    if omitted, it is derived by querying the parent thread and adding 1.

    LLM title and suggested questions are generated asynchronously in the background;
    they do not block this endpoint's response.
    """
    _user_id, sb = auth

    # Calculate nesting depth
    if body.depth is not None:
        # Provided directly by the frontend; no DB query needed (optimal path)
        depth = body.depth
    elif body.parent_thread_id:
        # Frontend did not send depth; query the parent thread
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
        depth = 1  # Default depth 1 when no parent thread

    # Write to DB and return immediately; LLM generates title/suggestions in the background
    try:
        thread_res = await _db(lambda: sb.table("threads").insert({
            "session_id": str(body.session_id),
            "parent_thread_id": str(body.parent_thread_id) if body.parent_thread_id else None,
            "anchor_text": body.anchor_text,
            "anchor_message_id": str(body.anchor_message_id) if body.anchor_message_id else None,
            "anchor_start_offset": body.anchor_start_offset,
            "anchor_end_offset": body.anchor_end_offset,
            "title": None,        # Filled asynchronously in the background
            "suggestions": None,  # Filled asynchronously in the background
            "depth": depth,
        }).execute())
    except Exception as exc:
        logger.exception("threads insert 失败 / threads insert failed")
        raise HTTPException(status_code=500, detail=f"创建线程失败 / Failed to create thread: {exc}")

    if not thread_res.data:
        raise HTTPException(status_code=500, detail="创建线程失败: insert 返回空 / Failed to create thread: insert returned empty")

    thread_data = thread_res.data[0]
    thread_id_str = thread_data["id"]

    # When there is anchor text, generate title + suggestions in the background and write back to DB
    if body.anchor_text:
        from services.stream_manager import _track
        _track(
            _generate_and_patch(
                thread_id_str,
                body.anchor_text,
                str(body.anchor_message_id) if body.anchor_message_id else None,
                lang=body.lang,
            )
        )

    return thread_data


async def _generate_and_patch(
    thread_id: str,
    anchor_text: str,
    anchor_message_id: str | None,
    lang: str | None = None,
) -> None:
    """
    Background task: fetch the full message containing the anchor → generate title and suggestions → write back to DB.

    Failures are silent; they do not affect normal sub-thread use (title/suggestions may be empty).
    """
    t0 = time.monotonic()
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
    t_fetch = time.monotonic() - t0

    llm_ok = True
    try:
        title, suggestions = await generate_title_and_suggestions(anchor_text, context_summary, lang=lang)
    except Exception as e:
        # LLM failed: use first 20 chars of anchor as title; no suggestions
        llm_ok = False
        title = anchor_text[:20]
        suggestions = []
        logger.warning("[bg-patch] LLM 失败 thread=%s err=%s", thread_id, e)
    t_llm = time.monotonic() - t0 - t_fetch

    try:
        sb = get_supabase()
        await _db(lambda: sb.table("threads").update({
            "title": title,
            "suggestions": suggestions or None,
        }).eq("id", thread_id).execute())
    except Exception:
        logger.exception("标题/建议回写失败（thread=%s）/ Title/suggestions write-back failed (thread=%s)", thread_id, thread_id)

    logger.info(
        "[bg-patch] thread=%s fetch=%.2fs llm=%.2fs total=%.2fs llm_ok=%s n_questions=%d",
        thread_id, t_fetch, t_llm, time.monotonic() - t0, llm_ok, len(suggestions),
    )


@router.get("/threads/{thread_id}/suggest")
async def suggest_questions(
    thread_id: uuid.UUID,
    lang: str | None = None,
    auth=Depends(get_current_user),
):
    """
    Return suggested follow-up questions for a sub-thread (up to 3) plus the
    LLM-generated title.

    Prefers the DB-cached values written at creation time to avoid redundant LLM calls.

    On cache miss (fallback for historical threads): poll every 200ms up to 3s
    (_generate_and_patch is usually done by then); if still missing, generate
    and write back in real time.

    Title is bundled into this response (instead of a separate endpoint) so the
    frontend can swap the anchor-truncated placeholder for the LLM title in the
    same poll cycle that already runs after pin creation.
    """
    _user_id, sb = auth
    t0 = time.monotonic()

    thread_res = await _db(lambda: (
        sb.table("threads")
        .select("anchor_text, anchor_message_id, parent_thread_id, suggestions, title")
        .eq("id", str(thread_id))
        .maybe_single()
        .execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    thread = thread_res.data
    title: str | None = thread.get("title")

    # Return cached suggestions immediately if available
    cached = thread.get("suggestions")
    if cached:
        try:
            questions = cached if isinstance(cached, list) else json.loads(cached)
            logger.info(
                "[suggest] thread=%s path=cache_hit elapsed=%.2fs n=%d",
                thread_id, time.monotonic() - t0, len(questions[:3]),
            )
            return {"questions": questions[:3], "title": title}
        except Exception:
            pass  # Cache corrupt; fall through to real-time generation

    # _generate_and_patch may still be running; poll every 200ms up to 3s total (15 attempts)
    for i in range(15):
        await asyncio.sleep(0.2)
        thread_res2 = await _db(lambda: (
            sb.table("threads")
            .select("suggestions, title")
            .eq("id", str(thread_id))
            .maybe_single()
            .execute()
        ))
        row2 = (thread_res2.data or {}) if thread_res2 else {}
        if row2.get("title"):
            title = row2["title"]
        cached2 = row2.get("suggestions")
        if cached2:
            try:
                questions = cached2 if isinstance(cached2, list) else json.loads(cached2)
                logger.info(
                    "[suggest] thread=%s path=poll_hit attempts=%d elapsed=%.2fs n=%d",
                    thread_id, i + 1, time.monotonic() - t0, len(questions[:3]),
                )
                return {"questions": questions[:3], "title": title}
            except Exception:
                break  # Cache corrupt; fall through to real-time generation

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

    sync_llm_ok = True
    try:
        new_title, questions = await generate_title_and_suggestions(anchor, context_summary, lang=lang)
        if new_title:
            title = new_title
    except Exception as e:
        sync_llm_ok = False
        # On LLM failure, return an empty list; the frontend renders a localized placeholder — no hard-coded Chinese fallback.
        questions = []
        logger.warning("[suggest] sync LLM 失败 thread=%s err=%s", thread_id, e)

    # Write back to cache to avoid regenerating next time. Update title only
    # when the row's title was previously empty so we never clobber a value
    # an earlier successful background run had already written.
    try:
        update: dict = {"suggestions": questions or None}
        if not thread.get("title") and title:
            update["title"] = title
        await _db(lambda: sb.table("threads").update(update).eq("id", str(thread_id)).execute())
    except Exception:
        pass

    logger.info(
        "[suggest] thread=%s path=sync_gen llm_ok=%s elapsed=%.2fs n=%d",
        thread_id, sync_llm_ok, time.monotonic() - t0, len(questions[:3]),
    )
    return {"questions": questions[:3], "title": title}


@router.get("/threads/{thread_id}/messages")
async def get_messages(thread_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    Get the message history for the specified thread in ascending chronological order.
    """
    _user_id, sb = auth

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

    # Position-aware sort: post-flatten main thread messages sort by position; otherwise created_at order is preserved
    msgs = messages_res.data or []
    msgs.sort(key=_message_sort_key)
    return msgs


def _message_sort_key(m: dict) -> tuple:
    """
    Sort key after flatten: position first (nulls last), then created_at as tiebreaker.
    """
    pos = m.get("position")
    return (0, pos, m.get("created_at") or "") if pos is not None else (1, 0, m.get("created_at") or "")


@router.post("/threads/{thread_id}/messages", status_code=201)
async def save_message(thread_id: uuid.UUID, body: dict, auth=Depends(get_current_user)):
    """
    Directly insert a message without triggering AI (e.g., saving merge output to the main thread).
    """
    _user_id, sb = auth
    role = body.get("role", "assistant")
    content = body.get("content", "")
    if not content.strip():
        raise HTTPException(status_code=422, detail="content 不能为空 / content cannot be empty")
    if role not in ("user", "assistant"):
        raise HTTPException(status_code=422, detail="role 必须为 user 或 assistant / role must be user or assistant")

    thread_res = await _db(lambda: (
        sb.table("threads").select("id").eq("id", str(thread_id)).maybe_single().execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    msg_res = await _db(lambda: sb.table("messages").insert({
        "thread_id": str(thread_id),
        "role": role,
        "content": content,
    }).execute())

    return msg_res.data[0] if msg_res.data else {}


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(thread_id: uuid.UUID, auth=Depends(get_current_user)):
    """
    Delete the thread and all its descendants (DB CASCADE handles messages/summaries).
    """
    _user_id, sb = auth

    thread_res = await _db(lambda: (
        sb.table("threads").select("id").eq("id", str(thread_id)).maybe_single().execute()
    ))
    if not thread_res or not thread_res.data:
        raise HTTPException(status_code=404, detail="线程不存在 / Thread not found")

    await _db(lambda: sb.table("threads").delete().eq("id", str(thread_id)).execute())
