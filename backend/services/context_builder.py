# backend/services/context_builder.py
"""
Context 构建服务 — 为 AI 调用组装消息列表
Context builder — assembles the message list for each AI call.

子线程 context 结构（从外到内）/ Sub-thread context structure (outer to inner):
  [system] 主线摘要（≤300 tokens，加 prompt cache）
           Main thread summary (≤300 tokens, prompt-cached)
  [system] 第1层子线摘要（≤200 tokens）  ← 若有 / if present
  ...
  [system] 锚点原文
           Anchor text
  [system] RAG 检索：相关附件块         ← 若有 / if present
           RAG retrieval: relevant attachment chunks
  [system] RAG 检索：相关历史对话       ← 若有 / if present
           RAG retrieval: relevant conversation memories
  [当前子线程对话历史]
  [Current sub-thread conversation history]

主线 context / Main thread context:
  [system] 历史摘要（仅当消息总数 > 10 时注入，≤300 tokens）
           History summary (injected only when total messages > 10, ≤300 tokens)
  [system] RAG 检索（若有）/ RAG retrieval (if any)
  [最近 10 条消息（user + assistant 合计）]
  [Most recent 10 messages (user + assistant combined)]

摘要结果缓存在 thread_summaries 表，相同 token_budget 直接复用；
有新消息时由 stream_manager 写时维护，自动保持新鲜。
Summary results are cached in thread_summaries; reused when the token_budget matches.
stream_manager maintains freshness on write — no separate cache invalidation needed.
"""
from __future__ import annotations

import asyncio

from db.supabase import get_supabase, run_db as _db
from services.llm_client import summarize

# 各嵌套深度对应的摘要 token 预算（越深越小）
# Summary token budgets per nesting depth (decreases with depth)
_BUDGETS_BY_DEPTH = [800, 500, 300, 150]

# 主线和子线程均取最近 N 条消息（user + assistant 合计）
# Number of most recent messages fetched for both main and sub-threads
_THREAD_MSG_LIMIT = 10

# Groq llama-3.3-70b-versatile 免费 TPM 12000，留 ~3000 给回答和 META 指令
# 粗略估算：中文约 2 chars/token，英文约 4 chars/token，取保守值 2.5
# Groq llama-3.3-70b-versatile free TPM=12000; reserve ~3000 for the reply and META instruction.
# Rough estimate: Chinese ~2 chars/token, English ~4 chars/token; use conservative 2.5.
_MAX_CONTEXT_CHARS = 18_000    # ≈ 7200 tokens，留充足余量 / ≈7200 tokens with headroom
_MAX_SINGLE_MSG_CHARS = 3_000  # 单条消息上限，约 1200 tokens / Per-message cap, ~1200 tokens


def _budget_for_depth(depth_from_root: int) -> int:
    """
    根据嵌套深度返回摘要 token 预算。
    Return the summary token budget for a given nesting depth from the root.
    """
    return _BUDGETS_BY_DEPTH[min(depth_from_root, len(_BUDGETS_BY_DEPTH) - 1)]


def _messages_to_text(messages: list[dict]) -> str:
    """
    将消息列表转为纯文本，用于摘要生成。
    Convert a message list to plain text for summarization.
    """
    lines = []
    for m in messages:
        role_label = "用户" if m["role"] == "user" else "AI"
        lines.append(f"{role_label}：{m['content']}")
    return "\n".join(lines)


def _content_chars(msg: dict) -> int:
    """
    估算一条消息的字符数（兼容 str 和 list[block] 两种 content 格式）。
    Estimate the character count of a message (handles both str and list[block] content formats).
    """
    c = msg.get("content", "")
    if isinstance(c, str):
        return len(c)
    if isinstance(c, list):
        return sum(len(b.get("text", "")) for b in c if isinstance(b, dict))
    return 0


def _truncate_str(text: str, max_chars: int) -> str:
    """
    截断字符串到 max_chars，超出部分附加省略提示。
    Truncate a string to max_chars and append an ellipsis note if truncated.
    """
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "…[内容过长，已截断 / Content truncated]"


def _trim_context(messages: list[dict]) -> list[dict]:
    """
    两阶段截断，将 context 总字符数控制在 _MAX_CONTEXT_CHARS 以内。
    Two-phase truncation to keep total context within _MAX_CONTEXT_CHARS.

    阶段 1 / Phase 1:
      超长 user/assistant 消息替换为占位符，引导 AI 使用 system 中的 RAG 块。
      Replace oversized user/assistant messages with a placeholder pointing to the RAG system messages.

    阶段 2 / Phase 2:
      若总量仍超限，从最早的 user/assistant 消息开始逐条删除；system 消息（摘要/锚点）不删。
      If total is still over limit, drop the oldest user/assistant messages one by one;
      system messages (summaries, anchors) are never removed.
    """
    # 阶段 1：超长消息替换为占位符 / Phase 1: replace oversized messages with placeholders
    result: list[dict] = []
    for m in messages:
        if m["role"] != "system" and isinstance(m.get("content"), str):
            if len(m["content"]) > _MAX_SINGLE_MSG_CHARS:
                char_len = len(m["content"])
                placeholder = (
                    f"[用户提供了长文本，共 {char_len} 字，已分块建立向量索引。"
                    f"相关段落已由系统上下文注入，请根据上方 system 消息中的内容回答。"
                    f"文本开头供参考：{m['content'][:200]}…]"
                )
                m = {**m, "content": placeholder}
        result.append(m)

    # 阶段 2：总量超限时删最早的 user/assistant 消息
    # Phase 2: drop the oldest user/assistant messages if total is still over limit
    while sum(_content_chars(m) for m in result) > _MAX_CONTEXT_CHARS:
        for i, m in enumerate(result):
            if m["role"] != "system":
                result.pop(i)
                break
        else:
            break  # 只剩 system 消息，停止 / Only system messages remain; stop

    return result


# _db 从 db.supabase.run_db 导入（顶部），保留原名以兼容测试 patch。
# _db is imported from db.supabase.run_db at the top; name preserved for test compatibility.


async def _get_or_create_summary(thread_id: str, token_budget: int) -> str:
    """
    读取线程摘要缓存，缓存缺失时全量生成并写库。
    Read the cached thread summary; if missing, generate it from scratch and write it to the DB.

    正常情况下摘要由 stream_manager 在每轮结束后写时维护，
    此函数只在历史数据迁移或首次访问时触发全量生成（兜底路径）。
    In normal operation summaries are maintained by stream_manager at write time.
    This function only triggers full generation for historical data migration or first access (fallback path).
    """
    # 检查缓存 / Check cache
    cached = await _db(
        lambda: get_supabase().table("thread_summaries")
        .select("summary, token_budget")
        .eq("thread_id", thread_id)
        .execute(),
        table="thread_summaries",
    )
    if cached.data:
        row = cached.data[0]
        if row["token_budget"] == token_budget:
            return row["summary"]

    # 缓存缺失：全量生成（取最近 80 条，足够覆盖核心信息）
    # Cache miss: generate from scratch (take the most recent 80 messages)
    msgs_res = await _db(
        lambda: get_supabase().table("messages")
        .select("role, content")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(80)
        .execute(),
        table="messages",
    )
    messages = list(reversed(msgs_res.data or []))
    if not messages:
        return ""

    summary_text = await summarize(_messages_to_text(messages), token_budget)

    await _db(
        lambda: get_supabase().table("thread_summaries").upsert({
            "thread_id": thread_id,
            "summary": summary_text,
            "token_budget": token_budget,
        }).execute(),
        table="thread_summaries",
    )

    return summary_text


async def build_context(
    thread_id: str,
    query_text: str = "",
    prefer_filename: str | None = None,
) -> list[dict]:
    """
    为指定线程构建 AI messages 列表。
    Build the AI messages list for the specified thread.

    query_text: 最新用户消息，用于 RAG 检索（stream_manager 传入）。
    query_text: The latest user message, used for RAG retrieval (passed in by stream_manager).

    prefer_filename: 优先使用来自该文件的 RAG 块（用户刚上传文件时传入）。
    prefer_filename: Prefer RAG chunks from this file (passed when the user just uploaded it).
    """
    thread_result = await _db(
        lambda: get_supabase().table("threads").select("*").eq("id", thread_id).maybe_single().execute(),
        table="threads",
    )
    thread = thread_result.data if thread_result else None
    if not thread:
        raise ValueError(f"线程 {thread_id} 不存在 / Thread {thread_id} does not exist")
    session_id = thread["session_id"]

    # RAG 检索（并发，失败不阻断）
    # RAG retrieval (concurrent; failure must not block the main flow)
    # 排除当前线程自身的对话记忆：已由原始消息+摘要覆盖，避免重叠注入
    # Exclude the current thread's own memories: already covered by its messages + summary
    from services.memory_service import retrieve_rag_context
    rag_items = (
        await retrieve_rag_context(
            session_id, query_text,
            exclude_thread_id=thread_id,
            prefer_filename=prefer_filename,
        )
        if query_text.strip() else []
    )

    # ── 主线：取最近 N 条 + 超出时注入历史摘要 ──────────────────────
    # Main thread: fetch the most recent N messages; inject history summary when total exceeds window
    if not thread.get("parent_thread_id"):
        # 并发：取最近 N 条消息 + 统计总消息数
        # Concurrently fetch the most recent N messages and count total messages
        msgs_res, count_res = await asyncio.gather(
            _db(
                lambda: get_supabase().table("messages")
                .select("role, content")
                .eq("thread_id", thread_id)
                .order("created_at", desc=True)
                .limit(_THREAD_MSG_LIMIT)
                .execute(),
                table="messages",
            ),
            _db(
                lambda: get_supabase().table("messages")
                .select("id", count="exact")
                .eq("thread_id", thread_id)
                .execute(),
                table="messages",
            ),
        )
        messages = list(reversed(msgs_res.data or []))
        history = [{"role": m["role"], "content": m["content"]} for m in messages]
        total = getattr(count_res, "count", None) or 0

        # 历史超出窗口时，注入主线摘要作为压缩背景
        # Inject the main thread summary as compressed background when history exceeds the window
        summary_prefix: list[dict] = []
        if total > _THREAD_MSG_LIMIT:
            summary = await _get_or_create_summary(thread_id, _budget_for_depth(0))
            if summary:
                summary_prefix = [{
                    "role": "system",
                    "content": f"[对话历史摘要（第 {_THREAD_MSG_LIMIT + 1} 条之前）]\n{summary}",
                }]

        return _trim_context(summary_prefix + rag_items + history)

    # ── 子线程：一次查出 session 内所有线程，内存构建祖先链 ──────────
    # Sub-thread: fetch all threads in the session in one query, then build the ancestor chain in memory
    session_id = thread["session_id"]
    all_threads_res = await _db(
        lambda: get_supabase().table("threads")
        .select("id, parent_thread_id, depth, anchor_text, session_id, title")
        .eq("session_id", session_id)
        .execute(),
        table="threads",
    )
    all_threads: dict[str, dict] = {
        t["id"]: t for t in (all_threads_res.data or [])
    }

    # 向上追溯祖先链，结果为 [最近祖先, ..., 主线]
    # Walk up to build the ancestor chain: [nearest ancestor, ..., main thread]
    ancestor_chain: list[dict] = []
    current = thread
    while current.get("parent_thread_id"):
        parent = all_threads.get(current["parent_thread_id"])
        if not parent:
            break
        ancestor_chain.append(parent)
        current = parent

    # 反转为从根到父的顺序：[主线, 第1层, 第2层, ...]
    # Reverse to root-first order: [main thread, depth-1, depth-2, ...]
    ancestors_root_first = list(reversed(ancestor_chain))
    # 越近的祖先越相关，分配越大的 budget；reversed 让直接父节点拿最大值
    # Closer ancestors are more relevant; reversed() gives the direct parent the largest budget
    budgets = [_budget_for_depth(i) for i in reversed(range(len(ancestors_root_first)))]

    # 并发获取所有祖先摘要
    # Concurrently fetch all ancestor summaries
    summaries: list[str] = await asyncio.gather(*[
        _get_or_create_summary(anc["id"], budget)
        for anc, budget in zip(ancestors_root_first, budgets)
    ])

    # 构建摘要前缀消息列表
    # Build the summary prefix message list
    prefix: list[dict] = []
    for i, (anc, summary) in enumerate(zip(ancestors_root_first, summaries)):
        if not summary:
            continue
        depth_from_root = i
        label = "主线对话摘要" if depth_from_root == 0 else f"第 {depth_from_root} 层子线程摘要"
        prefix.append({"role": "system", "content": f"[{label}]\n{summary}"})

    # 锚点原文（完整保留，是子线程追问的核心参照）
    # Anchor text (kept in full; it is the core reference for the sub-thread)
    anchor = thread.get("anchor_text", "")
    if anchor:
        prefix.append({
            "role": "system",
            "content": f'用户在上述对话中选中了以下内容并提出追问，请围绕这段内容回答：\n"{anchor}"',
        })

    # 当前子线程最近 N 条（desc 取后反转，保证时间顺序）
    # Most recent N messages in the current sub-thread (fetched desc, then reversed for chronological order)
    cur_msgs_res = await _db(
        lambda: get_supabase().table("messages")
        .select("role, content")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(_THREAD_MSG_LIMIT)
        .execute(),
        table="messages",
    )
    cur_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in reversed(cur_msgs_res.data or [])
    ]

    # 最终结构：祖先摘要 / 锚点 → RAG 检索 → 当前对话历史
    # Final structure: ancestor summaries / anchor → RAG retrieval → current conversation history
    return _trim_context(prefix + rag_items + cur_messages)
