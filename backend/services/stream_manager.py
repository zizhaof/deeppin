# backend/services/stream_manager.py
"""
SSE 流式推送管理器 — 调用 LLM、yield SSE 事件、持久化消息
SSE streaming manager — calls the LLM, yields SSE events, and persists messages.

主对话结束后，模型在回答末尾自动追加 META 块：
After the main reply, the model appends a META block at the end:
  <<<META>>>
  {"summary": "...", "title": "..."}   ← title 仅首轮主线 / title only on first main-thread round

stream_manager 实时截断 META 块，解析出 summary/title 后直接写 DB，
不再单独发起 LLM 调用更新摘要或标题。
stream_manager strips the META block in real time, parses summary/title, and writes them to the DB
without any additional LLM calls.

完整流程 / Full flow:
  1. yield ping
  2. 保存用户消息 / Save user message
  3. 查线程元数据（depth / session_id / 是否首轮）
     Fetch thread metadata (depth / session_id / whether this is the first round)
  4. 构建 context + RAG / Build context + RAG
  5. 流式生成，实时截断 META 块 / Stream generation, strip META block in real time
  6. 保存干净的 assistant 消息，yield done
     Save the clean assistant message, yield done
  7. 后台：从 META 直接写摘要；失败时降级调 merge_summary
     Background: write summary from META; fall back to merge_summary on failure
  8. 后台：首轮主线写标题；每 N 轮写 embedding
     Background: write title on first main-thread round; write embedding every N rounds
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncGenerator

from db.supabase import get_supabase, reset_supabase
from services.llm_client import chat_stream, merge_summary, META_SENTINEL, classify_search_intent
from services.context_builder import build_context, _budget_for_depth
from services.search_service import search as searxng_search, inject_search_results

logger = logging.getLogger(__name__)

# ── Background task 生命周期管理 / Background task lifecycle management ──
# 所有 fire-and-forget 后台任务都通过 _track() 注册，
# 确保引用不丢失、异常被记录、任务完成后自动移出集合。
# All fire-and-forget background tasks are registered via _track(),
# ensuring references are retained, exceptions are logged, and tasks
# are automatically removed from the set upon completion.
_bg_tasks: set[asyncio.Task] = set()


def _track(coro) -> asyncio.Task:
    """创建并追踪一个后台任务 / Create and track a background task."""
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


async def cancel_background_tasks() -> None:
    """
    取消所有未完成的后台任务（供 shutdown handler 调用）。
    Cancel all pending background tasks (called by shutdown handler).
    """
    for task in list(_bg_tasks):
        task.cancel()
    if _bg_tasks:
        await asyncio.gather(*_bg_tasks, return_exceptions=True)
    _bg_tasks.clear()


# META sentinel 的字节长度，用于流式截断的边界计算
# Byte length of the META sentinel, used for streaming truncation boundary calculation
_SENTINEL_LEN = len(META_SENTINEL)

# 匹配模型实际输出的 sentinel（<<<META>> 或 <<<META>>> 等变体）
# Matches actual model output — handles <<<META>> (2 >) or <<<META>>> (3 >) variants
_SENTINEL_RE = re.compile(r"<<<META>>+")

# 每 N 轮写一次对话 embedding（本地模型无额外成本，设为 1 即每轮都写）
# Write conversation embedding every N rounds (local model has no extra cost; 1 = every round)
EMBED_EVERY_N_ROUNDS = 1

# httpx/httpcore 连接断开错误特征字符串（与 context_builder 保持一致）
_CONN_ERR_TAGS = ("Server disconnected", "RemoteProtocolError", "ConnectionReset", "ConnectError")


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    连接断开时自动重置单例并重试一次。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    On connection errors, reset the singleton and retry once.
    """
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, fn)
    except Exception as e:
        err_str = str(e)
        err_type = type(e).__name__
        if any(tag in err_str or tag in err_type for tag in _CONN_ERR_TAGS):
            reset_supabase()
            return await loop.run_in_executor(None, fn)
        raise


# ── 解析 META JSON / Parse META JSON ─────────────────────────────────

def _parse_meta(raw: str) -> dict:
    """
    解析模型输出的 META JSON 字符串，多层兜底应对格式不完整的情况。
    Parse the META JSON string from model output, with multiple fallbacks for malformed output.

    尝试顺序 / Attempt order:
      1. 直接 json.loads / Direct json.loads
      2. 修复常见截断问题（补结尾括号）后重试
         Retry after fixing common truncation issues (appending closing braces)
      3. 正则逐字段提取 summary / title
         Regex field extraction for summary and title
    """
    raw = raw.strip()
    # 去掉可能的末尾标记 / Strip possible trailing marker
    raw = raw.replace("<<<END>>>", "").strip()

    # 尝试直接解析 / Try direct parse
    try:
        return json.loads(raw)
    except Exception:
        pass

    # 修复常见问题后重试（截断的 JSON 补上结尾括号）
    # Retry after fixing common truncation (appending closing braces)
    for candidate in (raw, raw + '"', raw + '"}', raw + '}'):
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # 正则逐字段提取 / Regex field-by-field extraction
    result: dict = {}
    for field in ("summary", "title"):
        m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
        if m:
            result[field] = m.group(1)
    return result


# ── 后台写入辅助函数 / Background write helpers ───────────────────────

async def _save_summary(thread_id: str, summary: str, budget: int) -> None:
    """
    将摘要 upsert 到 thread_summaries 表。
    Upsert the summary into the thread_summaries table.
    """
    try:
        await _db(
            lambda: get_supabase().table("thread_summaries").upsert({
                "thread_id": thread_id,
                "summary": summary,
                "token_budget": budget,
            }).execute()
        )
    except Exception:
        logger.exception("摘要写入失败（thread=%s）/ Summary write failed (thread=%s)", thread_id, thread_id)


async def _fallback_update_summary(
    thread_id: str,
    depth: int,
    user_content: str,
    assistant_content: str,
) -> None:
    """
    META 解析失败时的降级路径：用 merge_summary 单独更新摘要。
    Fallback path when META parsing fails: update the summary using merge_summary.

    读取现有摘要 → 与本轮对话合并 → 写库。
    Read existing summary → merge with this round's exchange → write to DB.
    """
    try:
        from services.llm_client import summarize
        budget = _budget_for_depth(depth)
        cached = await _db(
            lambda: get_supabase().table("thread_summaries")
            .select("summary")
            .eq("thread_id", thread_id)
            .execute()
        )
        existing = cached.data[0].get("summary", "") if cached.data else ""
        new_exchange = f"用户：{user_content}\nAI：{assistant_content}"
        new_summary = (
            await merge_summary(existing, new_exchange, budget)
            if existing
            else await summarize(new_exchange, budget)
        )
        await _db(
            lambda: get_supabase().table("thread_summaries").upsert({
                "thread_id": thread_id,
                "summary": new_summary,
                "token_budget": budget,
            }).execute()
        )
    except Exception:
        logger.exception("降级摘要更新失败（thread=%s）/ Fallback summary update failed (thread=%s)", thread_id, thread_id)


async def _save_title(
    thread_id: str,
    session_id: str | None,
    title: str,
) -> None:
    """
    将标题同时写入 threads 表和 sessions 表（主线首轮时同步 session 标题）。
    Write the title to both the threads table and the sessions table
    (syncs the session title on the first main-thread round).
    """
    try:
        await _db(
            lambda: get_supabase().table("threads").update({"title": title}).eq("id", thread_id).execute()
        )
        if session_id:
            await _db(
                lambda: get_supabase().table("sessions").update({"title": title}).eq("id", session_id).execute()
            )
    except Exception:
        logger.exception("标题写入失败（thread=%s）/ Title write failed (thread=%s)", thread_id, thread_id)


# ── 主流程 / Main flow ────────────────────────────────────────────────

async def stream_and_save(
    thread_id: str,
    user_content: str,
    attachment_filename: str | None = None,
    thread_meta: dict | None = None,
) -> AsyncGenerator[str, None]:
    """
    核心 SSE 生成器：保存消息 → 构建 context → 流式生成 → 后台写摘要/标题/embedding。
    Core SSE generator: save message → build context → stream → background write summary/title/embedding.
    """
    yield _sse("ping", {})

    if not user_content.strip():
        yield _sse("error", {"message": "消息不能为空 / Message cannot be empty"})
        return

    # 保存用户消息 / Save the user message
    try:
        await _db(lambda: get_supabase().table("messages").insert({
            "thread_id": thread_id,
            "role": "user",
            "content": user_content,
        }).execute())
    except Exception as exc:
        yield _sse("error", {"message": f"保存消息失败 / Failed to save message: {exc}"})
        return

    # 线程元数据：优先使用调用方传入的（stream.py 已查过，避免重复 DB 往返）
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
            ))
            thread_data = thread_res.data or {}
        except Exception as exc:
            yield _sse("error", {"message": f"查询线程失败 / Failed to query thread: {exc}"})
            return

    depth: int = thread_data.get("depth", 0)
    session_id: str | None = thread_data.get("session_id")

    # 首轮主线回复（用于触发标题生成）
    # First main-thread reply flag (used to trigger title generation)
    is_first_main_reply: bool = (depth == 0 and not thread_data.get("title"))
    summary_budget: int = _budget_for_depth(depth)

    # 搜索意图分类提前启动，与后续操作并发，净增延迟为零
    # Start intent classification early to run concurrently; net added latency is zero
    intent_task: asyncio.Task[bool] = asyncio.create_task(
        classify_search_intent(user_content)
    )

    # 长文本检测：分块向量化后再做 RAG 检索，保证本轮即可命中
    # Long-text detection: chunk and embed before RAG so hits are available in this round
    from services.memory_service import LONG_TEXT_THRESHOLD, store_long_text_chunks
    if session_id and len(user_content) > LONG_TEXT_THRESHOLD:
        char_count = len(user_content)
        yield _sse("status", {"text": f"正在分析长文本（{char_count} 字）… / Analyzing long text ({char_count} chars)…"})
        n_chunks = await store_long_text_chunks(session_id, user_content)
        if n_chunks:
            yield _sse("status", {"text": f"已建立 {n_chunks} 个索引块，正在检索相关段落… / Indexed {n_chunks} chunks, retrieving relevant passages…"})

    # 构建 context（含 RAG 检索，长文本块此时已入库可被检索到）
    # Build context (includes RAG; long-text chunks are now in the DB and searchable)
    try:
        context = await build_context(
            thread_id,
            query_text=user_content,
            prefer_filename=attachment_filename,
        )
    except Exception as exc:
        intent_task.cancel()
        yield _sse("error", {"message": f"构建上下文失败 / Failed to build context: {exc}"})
        return

    # 获取意图分类结果（通常此时已完成，await 近似无等待）
    # Get intent classification result (usually already done by now; await is near-zero wait)
    needs_search = await intent_task

    if needs_search:
        yield _sse("status", {"text": "正在搜索最新信息… / Searching for latest information…"})
        search_results = await searxng_search(user_content)
        if search_results:
            context = inject_search_results(context, search_results)

    yield _sse("status", {"text": "正在生成回答… / Generating answer…"})

    # ── 流式生成，实时截断 META 块 ──────────────────────────────────────
    # Stream generation with real-time META block stripping
    buffer = ""          # 末尾缓冲，防止 sentinel 跨 chunk / Tail buffer to handle sentinel spanning chunks
    full_content = ""    # 干净正文（不含 META）/ Clean body text (without META)
    meta_str = ""        # META 分隔符后的原始文本 / Raw text after the META separator
    in_meta = False

    try:
        async for chunk in chat_stream(
            context,
            need_title=is_first_main_reply,
            summary_budget=summary_budget,
        ):
            if in_meta:
                # 已进入 META 区域，收集但不输出
                # Inside META region: collect but do not yield
                meta_str += chunk
                continue

            buffer += chunk

            m = _SENTINEL_RE.search(buffer)
            if m:
                # 找到 META sentinel（支持 << / >>> 等变体）
                # META sentinel found (handles <<, >>> and other variants)
                before = buffer[:m.start()]
                if before:
                    full_content += before
                    yield _sse("chunk", {"content": before})
                meta_str = buffer[m.end():]
                in_meta = True
                buffer = ""
            else:
                # 只安全输出不可能是 sentinel 开头的部分
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

    # 冲刷末尾 buffer（正常结束、模型未输出 META 的情况）
    # Flush the tail buffer (normal end when the model produces no META output)
    if buffer and not in_meta:
        full_content += buffer
        yield _sse("chunk", {"content": buffer})

    # ── 解析 META / Parse META ─────────────────────────────────────────
    meta = _parse_meta(meta_str) if meta_str.strip() else {}
    summary: str = meta.get("summary", "")
    title: str = meta.get("title", "")

    # ── 保存 assistant 消息（干净正文，不含 META）────────────────────────
    # Save the assistant message (clean body text, no META)
    if not full_content.strip():
        # LLM 未输出任何内容，不存空消息
        # LLM produced no output; do not save an empty message
        yield _sse("done", {"message_id": None})
        return

    try:
        result = await _db(lambda: get_supabase().table("messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": full_content,
        }).execute())
        message_id = result.data[0]["id"] if result.data else None
        yield _sse("done", {"message_id": message_id})
    except Exception as exc:
        yield _sse("error", {"message": f"保存回复失败 / Failed to save reply: {exc}"})
        return

    # ── 后台任务（不阻塞 SSE）/ Background tasks (non-blocking) ──────────

    # 1. 写入当前线程摘要（META 解析到直接写，否则降级调 merge_summary）
    #    Write the thread summary (from META if available; otherwise fall back to merge_summary)
    if summary:
        _track(_save_summary(thread_id, summary, summary_budget))
    else:
        _track(
            _fallback_update_summary(thread_id, depth, user_content, full_content)
        )

    # 2. 主线首次回复：写入会话/线程标题并推送给前端
    #    First main-thread reply: write session/thread title and push to the frontend
    if is_first_main_reply and title:
        _track(_save_title(thread_id, session_id, title))
        yield _sse("thread_title", {"thread_id": thread_id, "title": title})

    # 3. 对话记忆向量化（节流：每 N 轮一次，计数放后台避免阻塞 SSE 关闭）
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
                ))
                assistant_count = count_res.count or 0
                if assistant_count % EMBED_EVERY_N_ROUNDS == 0:
                    from services.memory_service import store_conversation_memory
                    await store_conversation_memory(_sid, _tid, _uc, _fc)
            except Exception:
                pass

        _track(_maybe_embed())


def _sse(event_type: str, data: dict) -> str:
    """
    将事件类型和数据序列化为 SSE 格式字符串。
    Serialize an event type and data dict into an SSE-format string.
    """
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"
