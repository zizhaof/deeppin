# backend/services/stream_manager.py
"""
SSE streaming manager — calls the LLM, yields SSE events, and persists messages.

After the main reply, the model appends a META block at the end:
  <<<META>>>
  title only on first main-thread round

stream_manager truncates META blocks in real time, parses out summary/title and writes them to the DB,
stream_manager strips the META block in real time, parses summary/title, and writes them to the DB
without any additional LLM calls.

  1. yield ping
  Save user message
     Fetch thread metadata (depth / session_id / whether this is the first round)
  Build context + RAG
  Stream generation, strip META block in real time
     Save the clean assistant message, yield done
     Background: write summary from META; fall back to merge_summary on failure
     Background: write title on first main-thread round; write embedding every N rounds
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncGenerator

from db.supabase import get_supabase, run_db as _db
from services.llm_client import chat_stream, merge_summary, classify_search_intent, META_TAG_OPEN, META_TAG_CLOSE
from services.context_builder import build_context, _budget_for_depth
from services.search_service import search as searxng_search, inject_search_results

logger = logging.getLogger(__name__)

# Background task lifecycle management ──
# All fire-and-forget background tasks are registered via _track(),
# ensuring references are retained, exceptions are logged, and tasks
# are automatically removed from the set upon completion.
_bg_tasks: set[asyncio.Task] = set()


def _track(coro) -> asyncio.Task:
    """Create and track a background task."""
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


async def cancel_background_tasks() -> None:
    """
    Cancel all pending background tasks (called by shutdown handler).
    """
    for task in list(_bg_tasks):
        task.cancel()
    if _bg_tasks:
        await asyncio.gather(*_bg_tasks, return_exceptions=True)
    _bg_tasks.clear()


# Matches the META metadata XML opening tag <deeppin_meta>.
# Using a unique identifier prevents weak models from "simplifying" it as a placeholder
# (the old <<<META>>> sentinel was being collapsed to bare META by some free-tier models).
_SENTINEL_RE = re.compile(re.escape(META_TAG_OPEN))

# Max tail bytes withheld while streaming = open-tag length - 1, so we never
# yield the first half of the opening tag before detecting the full match.
_SENTINEL_LEN = len(META_TAG_OPEN)

# Write conversation embedding every N rounds (local model has no extra cost; 1 = every round)
EMBED_EVERY_N_ROUNDS = 1

# Lifetime turn cap for anonymous users (summed across all threads in the session).
# routers/stream.py + threads.py (gate)。
ANON_TURN_LIMIT = 20

# _db is imported from db.supabase.run_db at the top (aliased to preserve test patch compatibility).


# Parse META JSON ─────────────────────────────────

def _parse_meta(raw: str) -> dict:
    """
    Parse the META JSON string from model output, with multiple fallbacks for malformed output.

         Retry after fixing common truncation issues (appending closing braces)
         Regex field extraction for summary and title
    """
    raw = raw.strip()
    # Strip closing tag and legacy trailing markers
    raw = raw.replace(META_TAG_CLOSE, "").replace("<<<END>>>", "").strip()

    # Try direct parse
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Retry after fixing common truncation (appending closing braces)
    for candidate in (raw, raw + '"', raw + '"}', raw + '}'):
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # Regex field-by-field extraction
    result: dict = {}
    for field in ("summary", "title"):
        m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
        if m:
            result[field] = m.group(1)
    return result


# Background write helpers ───────────────────────

async def _save_summary(thread_id: str, summary: str, budget: int) -> None:
    """
    Upsert the summary into the thread_summaries table.
    """
    try:
        await _db(
            lambda: get_supabase().table("thread_summaries").upsert({
                "thread_id": thread_id,
                "summary": summary,
                "token_budget": budget,
            }).execute(),
            table="thread_summaries",
        )
    except Exception:
        logger.exception("摘要写入失败（thread=%s）/ Summary write failed (thread=%s)", thread_id, thread_id)


async def _fallback_update_summary(
    thread_id: str,
    depth: int,
    user_content: str,
    assistant_content: str,
    lang: str | None = None,
) -> None:
    """
    Fallback path when META parsing fails: update the summary using merge_summary.

    Read existing summary → merge with this round's exchange → write to DB.
    """
    try:
        from services.llm_client import summarize
        budget = _budget_for_depth(depth)
        cached = await _db(
            lambda: get_supabase().table("thread_summaries")
            .select("summary")
            .eq("thread_id", thread_id)
            .execute(),
            table="thread_summaries",
        )
        existing = cached.data[0].get("summary", "") if cached.data else ""
        new_exchange = f"User: {user_content}\nAI: {assistant_content}"
        new_summary = (
            await merge_summary(existing, new_exchange, budget, lang=lang)
            if existing
            else await summarize(new_exchange, budget, lang=lang)
        )
        await _db(
            lambda: get_supabase().table("thread_summaries").upsert({
                "thread_id": thread_id,
                "summary": new_summary,
                "token_budget": budget,
            }).execute(),
            table="thread_summaries",
        )
    except Exception:
        logger.exception("降级摘要更新失败（thread=%s）/ Fallback summary update failed (thread=%s)", thread_id, thread_id)


async def _save_title(
    thread_id: str,
    session_id: str | None,
    title: str,
) -> None:
    """
    Write the title to both the threads table and the sessions table
    (syncs the session title on the first main-thread round).
    """
    try:
        await _db(
            lambda: get_supabase().table("threads").update({"title": title}).eq("id", thread_id).execute(),
            table="threads",
        )
        if session_id:
            await _db(
                lambda: get_supabase().table("sessions").update({"title": title}).eq("id", session_id).execute(),
                table="sessions",
            )
    except Exception:
        logger.exception("标题写入失败（thread=%s）/ Title write failed (thread=%s)", thread_id, thread_id)


# Main flow ────────────────────────────────────────────────

async def stream_and_save(
    thread_id: str,
    user_content: str,
    attachment_filename: str | None = None,
    thread_meta: dict | None = None,
    session_id: str | None = None,
    lang: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Core SSE generator: save message → build context → stream → background write summary/title/embedding.

    When session_id is provided, sessions.turn_count is atomically incremented before
    the turn completes — used for anon-user quota + usage stats. Optional for backward
    compatibility; callers that omit it skip the increment.
    """
    yield _sse("ping", {})

    if not user_content.strip():
        yield _sse("error", {"message": "消息不能为空 / Message cannot be empty"})
        return

    # Save the user message
    try:
        await _db(lambda: get_supabase().table("messages").insert({
            "thread_id": thread_id,
            "role": "user",
            "content": user_content,
        }).execute(), table="messages")
    except Exception as exc:
        yield _sse("error", {"message": f"保存消息失败 / Failed to save message: {exc}"})
        return

    # Atomic increment via RPC (UPDATE ... RETURNING); concurrency-safe.
    # Router already gated the request; this is pure accounting. Don't fail the turn if it errors.
    if session_id:
        try:
            await _db(
                lambda: get_supabase().rpc(
                    "increment_session_turn_count",
                    {"p_session_id": session_id},
                ).execute(),
                table="sessions",
            )
        except Exception:
            logger.exception("turn_count 递增失败（session=%s）/ turn_count increment failed", session_id)

    # Thread metadata: prefer caller-supplied data (stream.py already fetched it, skip redundant query)
    if thread_meta:
        thread_data = thread_meta
    else:
        try:
            thread_res = await _db(lambda: (
                get_supabase().table("threads")
                .select("depth, title, session_id")
                .eq("id", thread_id)
                .single()
                .execute()
            ), table="threads")
            thread_data = thread_res.data or {}
        except Exception as exc:
            yield _sse("error", {"message": f"查询线程失败 / Failed to query thread: {exc}"})
            return

    depth: int = thread_data.get("depth", 0)
    session_id: str | None = thread_data.get("session_id")

    # First main-thread reply flag (used to trigger title generation)
    is_first_main_reply: bool = (depth == 0 and not thread_data.get("title"))
    summary_budget: int = _budget_for_depth(depth)

    # Start intent classification early to run concurrently; net added latency is zero
    intent_task: asyncio.Task[bool] = asyncio.create_task(
        classify_search_intent(user_content)
    )

    # Long-text detection: chunk and embed before RAG so hits are available in this round
    from services.memory_service import LONG_TEXT_THRESHOLD, store_long_text_chunks
    if session_id and len(user_content) > LONG_TEXT_THRESHOLD:
        char_count = len(user_content)
        yield _sse("status", {"text": f"正在分析长文本（{char_count} 字）… / Analyzing long text ({char_count} chars)…"})
        n_chunks = await store_long_text_chunks(session_id, user_content)
        if n_chunks:
            yield _sse("status", {"text": f"已建立 {n_chunks} 个索引块，正在检索相关段落… / Indexed {n_chunks} chunks, retrieving relevant passages…"})

    # Build context (includes RAG; long-text chunks are now in the DB and searchable)
    try:
        context = await build_context(
            thread_id,
            query_text=user_content,
            prefer_filename=attachment_filename,
            lang=lang,
        )
    except Exception as exc:
        intent_task.cancel()
        yield _sse("error", {"message": f"构建上下文失败 / Failed to build context: {exc}"})
        return

    # Get intent classification result (usually already done by now; await is near-zero wait)
    needs_search = await intent_task

    if needs_search:
        yield _sse("status", {"text": "正在搜索最新信息… / Searching for latest information…"})
        search_results = await searxng_search(user_content)
        if search_results:
            context = inject_search_results(context, search_results)

    yield _sse("status", {"text": "正在生成回答… / Generating answer…"})

    # Stream generation with real-time META block stripping
    buffer = ""          # Tail buffer to handle sentinel spanning chunks
    full_content = ""    # Clean body text (without META)
    meta_str = ""        # Raw text after the META separator
    in_meta = False

    stream = await chat_stream(
        context,
        need_title=is_first_main_reply,
        summary_budget=summary_budget,
        lang=lang,
    )

    try:
        async for chunk in stream:
            if in_meta:
                # Inside META region: collect but do not yield
                meta_str += chunk
                continue

            buffer += chunk

            m = _SENTINEL_RE.search(buffer)
            if m:
                # Found <deeppin_meta> opening tag: truncate body and enter META mode.
                before = buffer[:m.start()]
                if before:
                    full_content += before
                    yield _sse("chunk", {"content": before})
                meta_str = buffer[m.end():]
                in_meta = True
                buffer = ""
            else:
                # Only emit the portion that cannot be the beginning of the sentinel
                safe_len = max(0, len(buffer) - (_SENTINEL_LEN - 1))
                if safe_len > 0:
                    safe_part = buffer[:safe_len]
                    full_content += safe_part
                    yield _sse("chunk", {"content": safe_part})
                    buffer = buffer[safe_len:]

    except Exception as exc:
        if buffer and not in_meta:
            full_content += buffer
        yield _sse("error", {"message": f"AI 生成失败 / AI generation failed: {exc}"})
        return

    # Flush the tail buffer (normal end when the model produces no META output)
    if buffer and not in_meta:
        full_content += buffer
        yield _sse("chunk", {"content": buffer})

    # Parse META ─────────────────────────────────────────
    meta = _parse_meta(meta_str) if meta_str.strip() else {}
    summary: str = meta.get("summary", "")
    title: str = meta.get("title", "")

    # Save the assistant message (clean body text, no META)
    if not full_content.strip():
        # LLM produced no output; do not save an empty message
        yield _sse("done", {"message_id": None, "model": stream.model_used})
        return

    try:
        result = await _db(lambda: get_supabase().table("messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": full_content,
            "model": stream.model_used,
        }).execute(), table="messages")
        message_id = result.data[0]["id"] if result.data else None
        yield _sse("done", {"message_id": message_id, "model": stream.model_used})
    except Exception as exc:
        yield _sse("error", {"message": f"保存回复失败 / Failed to save reply: {exc}"})
        return

    # Background tasks (non-blocking) ──────────

    #    Write the thread summary (from META if available; otherwise fall back to merge_summary)
    if summary:
        _track(_save_summary(thread_id, summary, summary_budget))
    else:
        _track(
            _fallback_update_summary(thread_id, depth, user_content, full_content, lang=lang)
        )

    #    First main-thread reply: write session/thread title and push to the frontend
    if is_first_main_reply and title:
        _track(_save_title(thread_id, session_id, title))
        yield _sse("thread_title", {"thread_id": thread_id, "title": title})

    #    Vectorize conversation memory (throttled; count runs in background to avoid blocking SSE teardown)
    if session_id:
        _sid, _tid, _uc, _fc = session_id, thread_id, user_content, full_content

        async def _maybe_embed() -> None:
            try:
                count_res = await _db(lambda: (
                    get_supabase().table("messages")
                    .select("id", count="exact")
                    .eq("thread_id", _tid)
                    .eq("role", "assistant")
                    .execute()
                ), table="messages")
                assistant_count = count_res.count or 0
                if assistant_count % EMBED_EVERY_N_ROUNDS == 0:
                    from services.memory_service import store_conversation_memory
                    await store_conversation_memory(_sid, _tid, _uc, _fc)
            except Exception:
                pass

        _track(_maybe_embed())


def _sse(event_type: str, data: dict) -> str:
    """
    Serialize an event type and data dict into an SSE-format string.
    """
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"
