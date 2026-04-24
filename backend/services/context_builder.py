# backend/services/context_builder.py
"""
Context builder — assembles the message list for each AI call.

Sub-thread context structure (outer to inner):
           Main thread summary (≤300 tokens, prompt-cached)
  if present
  ...
           Anchor text
           RAG retrieval: relevant attachment chunks
           RAG retrieval: relevant conversation memories
  [Current sub-thread conversation history]

Main thread context:
           History summary (injected only when total messages > 10, ≤300 tokens)
  [system] RAG retrieval (if any)
  [Most recent 10 messages (user + assistant combined)]

Summary results are cached in the thread_summaries table; the same token_budget is reused directly;
Summary results are cached in thread_summaries; reused when the token_budget matches.
stream_manager maintains freshness on write — no separate cache invalidation needed.
"""
from __future__ import annotations

import asyncio

from db.supabase import get_supabase, run_db as _db
from services.llm_client import summarize

# Summary token budgets per nesting depth (decreases with depth)
_BUDGETS_BY_DEPTH = [800, 500, 300, 150]

# Number of most recent messages fetched for both main and sub-threads
_THREAD_MSG_LIMIT = 10

# Groq llama-3.3-70b-versatile free TPM=12000; reserve ~3000 for the reply and META instruction.
# Rough estimate: Chinese ~2 chars/token, English ~4 chars/token; use conservative 2.5.
_MAX_CONTEXT_CHARS = 18_000    # ≈7200 tokens with headroom
_MAX_SINGLE_MSG_CHARS = 3_000  # Per-message cap, ~1200 tokens


def _budget_for_depth(depth_from_root: int) -> int:
    """
    Return the summary token budget for a given nesting depth from the root.
    """
    return _BUDGETS_BY_DEPTH[min(depth_from_root, len(_BUDGETS_BY_DEPTH) - 1)]


def _messages_to_text(messages: list[dict]) -> str:
    """
    Convert a message list to plain text for summarization.
    """
    lines = []
    for m in messages:
        role_label = "User" if m["role"] == "user" else "AI"
        lines.append(f"{role_label}: {m['content']}")
    return "\n".join(lines)


def _content_chars(msg: dict) -> int:
    """
    Estimate the character count of a message (handles both str and list[block] content formats).
    """
    c = msg.get("content", "")
    if isinstance(c, str):
        return len(c)
    if isinstance(c, list):
        return sum(len(b.get("text", "")) for b in c if isinstance(b, dict))
    return 0


def _trim_context(messages: list[dict]) -> list[dict]:
    """
    Two-phase truncation to keep total context within _MAX_CONTEXT_CHARS.

      Replace oversized user/assistant messages with a placeholder pointing to the RAG system messages.

      If total is still over limit, drop the oldest user/assistant messages one by one;
      system messages (summaries, anchors) are never removed.
    """
    # Phase 1: replace oversized messages with placeholders
    result: list[dict] = []
    for m in messages:
        if m["role"] != "system" and isinstance(m.get("content"), str):
            if len(m["content"]) > _MAX_SINGLE_MSG_CHARS:
                char_len = len(m["content"])
                placeholder = (
                    f"[The user provided a long text of {char_len} characters; it has been chunked "
                    f"and indexed. Relevant passages have been injected by the system context — "
                    f"answer using the system messages above. Opening excerpt for reference: "
                    f"{m['content'][:200]}…]"
                )
                m = {**m, "content": placeholder}
        result.append(m)

    # Phase 2: drop the oldest user/assistant messages if total is still over limit
    while sum(_content_chars(m) for m in result) > _MAX_CONTEXT_CHARS:
        for i, m in enumerate(result):
            if m["role"] != "system":
                result.pop(i)
                break
        else:
            break  # Only system messages remain; stop

    return result


# _db is imported from db.supabase.run_db at the top; name preserved for test compatibility.


async def _get_or_create_summary(
    thread_id: str,
    token_budget: int,
    lang: str | None = None,
) -> str:
    """
    Read the cached thread summary; if missing, generate it from scratch and write it to the DB.

    In normal operation summaries are maintained by stream_manager at write time.
    This function only triggers full generation for historical data migration or first access (fallback path).

    `lang` forces the output language of the summary when a new one is generated here.
    """
    # Check cache
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

    summary_text = await summarize(_messages_to_text(messages), token_budget, lang=lang)

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
    lang: str | None = None,
) -> list[dict]:
    """
    Build the AI messages list for the specified thread.

    query_text: The latest user message, used for RAG retrieval (passed in by stream_manager).

    prefer_filename: Prefer RAG chunks from this file (passed when the user just uploaded it).

    lang: UI locale forwarded to any lazy summary generation so historical
    cache-miss fallbacks also respect the user's language.
    """
    thread_result = await _db(
        lambda: get_supabase().table("threads").select("*").eq("id", thread_id).maybe_single().execute(),
        table="threads",
    )
    thread = thread_result.data if thread_result else None
    if not thread:
        raise ValueError(f"线程 {thread_id} 不存在 / Thread {thread_id} does not exist")
    session_id = thread["session_id"]

    # RAG retrieval (concurrent; failure must not block the main flow)
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

    # Main thread: fetch the most recent N messages; inject history summary when total exceeds window
    if not thread.get("parent_thread_id"):
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

        # Inject the main thread summary as compressed background when history exceeds the window
        summary_prefix: list[dict] = []
        if total > _THREAD_MSG_LIMIT:
            summary = await _get_or_create_summary(thread_id, _budget_for_depth(0), lang=lang)
            if summary:
                summary_prefix = [{
                    "role": "system",
                    "content": (
                        f"[Conversation history summary (older than the last {_THREAD_MSG_LIMIT} messages)]\n"
                        f"{summary}"
                    ),
                }]

        return _trim_context(summary_prefix + rag_items + history)

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

    # Walk up to build the ancestor chain: [nearest ancestor, ..., main thread]
    ancestor_chain: list[dict] = []
    current = thread
    while current.get("parent_thread_id"):
        parent = all_threads.get(current["parent_thread_id"])
        if not parent:
            break
        ancestor_chain.append(parent)
        current = parent

    # Reverse to root-first order: [main thread, depth-1, depth-2, ...]
    ancestors_root_first = list(reversed(ancestor_chain))
    # Closer ancestors are more relevant; reversed() gives the direct parent the largest budget
    budgets = [_budget_for_depth(i) for i in reversed(range(len(ancestors_root_first)))]

    # Concurrently fetch all ancestor summaries
    summaries: list[str] = await asyncio.gather(*[
        _get_or_create_summary(anc["id"], budget, lang=lang)
        for anc, budget in zip(ancestors_root_first, budgets)
    ])

    # Build the summary prefix message list
    prefix: list[dict] = []
    for i, (anc, summary) in enumerate(zip(ancestors_root_first, summaries)):
        if not summary:
            continue
        depth_from_root = i
        label = (
            "Main-thread summary"
            if depth_from_root == 0
            else f"Sub-thread summary (depth {depth_from_root})"
        )
        prefix.append({"role": "system", "content": f"[{label}]\n{summary}"})

    # Anchor text (kept in full; it is the core reference for the sub-thread)
    anchor = thread.get("anchor_text", "")
    if anchor:
        prefix.append({
            "role": "system",
            "content": (
                "The user selected the following span in the conversation above and is asking a "
                f'follow-up about it. Focus your answer on this span:\n"{anchor}"'
            ),
        })

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

    # Final structure: ancestor summaries / anchor → RAG retrieval → current conversation history
    return _trim_context(prefix + rag_items + cur_messages)
