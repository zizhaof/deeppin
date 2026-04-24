# backend/services/memory_service.py
"""
Conversation memory service — dual-track RAG retrieval system.

Two retrieval tracks:
  1. attachment_chunks: chunk vectors of user-uploaded files
  2. conversation_memories: vectorized summaries of each dialogue turn

Two retrieval tracks:
  1. Attachment chunks (attachment_chunks): vector chunks of user-uploaded files
  2. Conversation memories (conversation_memories): vectorized summaries of past conversation rounds

Key functions:
                             Chunk and embed an oversized user message into attachment_chunks
                             After each round, embed the (user+AI) exchange into conversation_memories
                             Concurrently search both tracks and return system messages for AI context injection
"""
from __future__ import annotations

import asyncio
import logging
import re

logger = logging.getLogger(__name__)

# Messages exceeding this character count are treated as long text and indexed in chunks
LONG_TEXT_THRESHOLD = 800


from db.supabase import run_db as _db  # canonical wrapper with metrics + retry


# Long-text chunking ──────────────────────────────────

def _chunk_text(text: str) -> list[str]:
    """
    Reuse the LangChain splitter from attachment_processor to ensure consistent semantic boundaries.
    """
    from services.attachment_processor import chunk_text
    return chunk_text(text)


async def store_long_text_chunks(
    session_id: str,
    text: str,
    label: str = "用户长文本",
) -> int:
    """
    Chunk and embed an oversized user message, storing it in attachment_chunks
    so it can be retrieved by RAG in this round and future rounds.

    Returns the number of chunks written (0 means failure or empty text).
    """
    try:
        chunks = _chunk_text(text)
        if not chunks:
            return 0

        from services.embedding_service import embed_texts, format_vector
        from db.supabase import get_supabase

        vecs = await embed_texts(chunks)
        sb = get_supabase()

        rows = [
            {
                "session_id": session_id,
                "filename": label,
                "chunk_index": i,
                "content": chunk,
                "embedding": format_vector(vec),
            }
            for i, (chunk, vec) in enumerate(zip(chunks, vecs))
        ]
        await _db(lambda: sb.table("attachment_chunks").insert(rows).execute(), table="attachment_chunks")
        logger.info("长文本分块完成：%d 块（session=%s）/ Long text chunked: %d chunks (session=%s)",
                    len(rows), session_id, len(rows), session_id)
        return len(rows)
    except Exception:
        logger.exception("长文本分块存储失败（session=%s）/ Long text chunk storage failed (session=%s)", session_id, session_id)
        return 0


# Store conversation memory ──────────────────────────

async def store_conversation_memory(
    session_id: str,
    thread_id: str,
    user_content: str,
    assistant_content: str,
) -> None:
    """
    Vectorize one conversation round (user + AI) and store it in conversation_memories.

    Designed for fire-and-forget background use; all exceptions are caught internally.
    """
    try:
        # Merge into a "User: ... \nAI: ..." format before embedding to preserve dialogue structure
        content = f"用户：{user_content}\nAI：{assistant_content}"
        from services.embedding_service import embed_text, format_vector
        vec = await embed_text(content)

        from db.supabase import get_supabase
        sb = get_supabase()
        await _db(
            lambda: sb.table("conversation_memories").insert({
                "session_id": session_id,
                "thread_id": thread_id,
                "content": content,
                "embedding": format_vector(vec),
            }).execute(),
            table="conversation_memories",
        )
    except Exception:
        logger.exception("对话记忆写入失败（session=%s, thread=%s）/ Conversation memory write failed (session=%s, thread=%s)",
                         session_id, thread_id, session_id, thread_id)


# Retrieve RAG context ───────────────────────────

# Instruction-type query keywords: the user is asking about "this file/report" rather than
# a specific concept, so the query vector is semantically distant from the file content;
# the similarity threshold must be lowered proactively.
_FILE_REF_PATTERN = re.compile(
    r"(文件|文档|附件|报告|这份|这个|刚才|上传|pdf|docx|excel|csv|总结|摘要|分析一下|讲了什么|说了什么|内容是什么)",
    re.IGNORECASE,
)


async def retrieve_rag_context(
    session_id: str,
    query_text: str,
    attachment_top_k: int = 4,
    memory_top_k: int = 3,
    exclude_thread_id: str | None = None,
    prefer_filename: str | None = None,
) -> list[dict]:
    """
    Concurrently search attachment chunks and conversation memories based on query_text;
    return system messages to be injected into the AI context.

    Two-layer fallback strategy (addresses low hit rate for instruction-type queries):
         Primary search: threshold 0.45 to reduce false negatives
         If no chunks match, zero-threshold fallback: force-return the top-k regardless of score

    prefer_filename: When set, prefer chunks from this specific file to avoid older files
                     polluting the context when the user has just uploaded a new file.

    RAG failure never blocks the main conversation; any exception returns an empty list.
    """
    if not query_text or len(query_text.strip()) < 5:
        return []

    try:
        from services.embedding_service import embed_text, format_vector
        from db.supabase import get_supabase

        # Detect file-reference keywords: use zero threshold directly, skip primary search to save one RPC
        is_file_ref = bool(_FILE_REF_PATTERN.search(query_text))
        attachment_threshold = 0.0 if is_file_ref else 0.45

        vec = await embed_text(query_text)
        vec_str = format_vector(vec)
        sb = get_supabase()

        # Concurrent attachment chunk search + conversation memory search
        chunk_res, memory_res = await asyncio.gather(
            _db(lambda: sb.rpc("search_attachment_chunks", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": attachment_top_k,
                "p_threshold": attachment_threshold,
            }).execute(), table="search_attachment_chunks"),
            _db(lambda: sb.rpc("search_conversation_memories", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": memory_top_k,
                "p_threshold": 0.45,
                **({"p_exclude_thread_id": exclude_thread_id} if exclude_thread_id else {}),
            }).execute(), table="search_conversation_memories"),
        )

        chunks = chunk_res.data or []

        # Fallback: if primary search returned nothing and zero-threshold wasn't already used, retry without threshold
        if not chunks and attachment_threshold > 0:
            fallback_res = await _db(lambda: sb.rpc("search_attachment_chunks", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": attachment_top_k,
                "p_threshold": 0.0,
            }).execute(), table="search_attachment_chunks")
            chunks = fallback_res.data or []

        # File preference filter: after uploading/sending a file, return only that file's chunks.
        # If no chunks exist for it, the file was sent inline (already in message history) —
        # suppress all attachment RAG to prevent old files from polluting the context.
        if prefer_filename:
            preferred = [c for c in chunks if c.get("filename") == prefer_filename]
            if preferred:
                # RAG file: found matching chunks — use only those
                chunks = preferred
            else:
                # The preferred file's chunks didn't make top-k; widen search and filter again
                wider_res = await _db(lambda: sb.rpc("search_attachment_chunks", {
                    "query_embedding": vec_str,
                    "p_session_id": session_id,
                    "p_top_k": attachment_top_k * 4,
                    "p_threshold": 0.0,
                }).execute(), table="search_attachment_chunks")
                preferred = [c for c in (wider_res.data or []) if c.get("filename") == prefer_filename]
                if preferred:
                    # Found after widening — use only those
                    chunks = preferred[:attachment_top_k]
                else:
                    # No chunks at all: file was sent inline, content is already in message history.
                    # Suppress all attachment RAG to prevent old-file chunks from polluting context.
                    chunks = []

        result: list[dict] = []

        if chunks:
            parts = [
                f"[{c['filename']} 第{c['chunk_index']+1}块]\n{c['content']}"
                for c in chunks
            ]
            result.append({
                "role": "system",
                "content": "以下是用户上传文档中与当前问题相关的内容：\n\n"
                           + "\n\n---\n\n".join(parts),
            })

        memories = memory_res.data or []
        if memories:
            parts = [m["content"] for m in memories]
            result.append({
                "role": "system",
                "content": "以下是历史对话中与当前问题相关的片段（供参考）：\n\n"
                           + "\n\n---\n\n".join(parts),
            })

        return result

    except Exception:
        logger.exception("RAG 检索失败（session=%s）/ RAG retrieval failed (session=%s)", session_id, session_id)
        return []  # RAG failure must not block the main conversation
