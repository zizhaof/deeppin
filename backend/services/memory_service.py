# backend/services/memory_service.py
"""
对话记忆服务 — 双轨检索系统
Conversation memory service — dual-track RAG retrieval system.

两条检索轨道：
  1. 附件块（attachment_chunks）：用户上传文件的分块向量
  2. 对话记忆（conversation_memories）：每轮对话向量化后的摘要

Two retrieval tracks:
  1. Attachment chunks (attachment_chunks): vector chunks of user-uploaded files
  2. Conversation memories (conversation_memories): vectorized summaries of past conversation rounds

主要函数 / Key functions:
  store_long_text_chunks     将超长用户消息分块向量化存入 attachment_chunks
                             Chunk and embed an oversized user message into attachment_chunks
  store_conversation_memory  每轮对话结束后将 (用户+AI) 向量化存入 conversation_memories
                             After each round, embed the (user+AI) exchange into conversation_memories
  retrieve_rag_context       根据最新用户消息并发检索两轨，返回注入 AI context 的 system 消息列表
                             Concurrently search both tracks and return system messages for AI context injection
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# 超过此字符数认为是长文本，触发分块向量化索引
# Messages exceeding this character count are treated as long text and indexed in chunks
LONG_TEXT_THRESHOLD = 800


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


# ── 长文本分块 / Long-text chunking ──────────────────────────────────

def _chunk_text(text: str) -> list[str]:
    """
    复用 attachment_processor 的 LangChain splitter，保证语义边界一致。
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
    将超长用户消息分块向量化后存入 attachment_chunks，供本轮及后续 RAG 检索使用。
    Chunk and embed an oversized user message, storing it in attachment_chunks
    so it can be retrieved by RAG in this round and future rounds.

    返回写入的块数（0 表示失败或文本为空）。
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
        await _db(lambda: sb.table("attachment_chunks").insert(rows).execute())
        logger.info("长文本分块完成：%d 块（session=%s）/ Long text chunked: %d chunks (session=%s)",
                    len(rows), session_id, len(rows), session_id)
        return len(rows)
    except Exception:
        logger.exception("长文本分块存储失败（session=%s）/ Long text chunk storage failed (session=%s)", session_id, session_id)
        return 0


# ── 写入对话记忆 / Store conversation memory ──────────────────────────

async def store_conversation_memory(
    session_id: str,
    thread_id: str,
    user_content: str,
    assistant_content: str,
) -> None:
    """
    将一轮对话（用户 + AI）向量化后存入 conversation_memories。
    Vectorize one conversation round (user + AI) and store it in conversation_memories.

    设计为后台 fire-and-forget 调用，内部捕获所有异常。
    Designed for fire-and-forget background use; all exceptions are caught internally.
    """
    try:
        # 合并为 "用户：... \nAI：..." 格式再向量化，保留对话结构
        # Merge into "用户：...\nAI：..." format before embedding to preserve dialogue structure
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
            }).execute()
        )
    except Exception:
        logger.exception("对话记忆写入失败（session=%s, thread=%s）/ Conversation memory write failed (session=%s, thread=%s)",
                         session_id, thread_id, session_id, thread_id)


# ── 检索 RAG 上下文 / Retrieve RAG context ───────────────────────────

# 指令型查询特征词：用户问的是「这个文件/这份报告」而非具体知识点，
# 此时 query 向量和文件内容向量语义距离较远，需要主动降低阈值。
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
    根据 query_text 并发检索附件块和历史对话记忆，返回注入 AI context 的 system 消息列表。
    Concurrently search attachment chunks and conversation memories based on query_text;
    return system messages to be injected into the AI context.

    两层兜底策略（解决「指令型查询」命中率低的问题）：
    Two-layer fallback strategy (addresses low hit rate for instruction-type queries):
      1. 主检索：阈值 0.45，减少漏召回
         Primary search: threshold 0.45 to reduce false negatives
      2. 若附件块命中为空，零阈值兜底：强制返回相似度最高的 top-k
         If no chunks match, zero-threshold fallback: force-return the top-k regardless of score

    prefer_filename: 优先使用来自该文件的块（文件上传后首次问答时传入，避免旧文件污染）。
    prefer_filename: When set, prefer chunks from this specific file to avoid older files
                     polluting the context when the user has just uploaded a new file.

    RAG 失败不阻断正常对话，任何异常返回空列表。
    RAG failure never blocks the main conversation; any exception returns an empty list.
    """
    if not query_text or len(query_text.strip()) < 5:
        return []

    try:
        from services.embedding_service import embed_text, format_vector
        from db.supabase import get_supabase

        # 检测文件引用词：直接用零阈值，跳过主检索节省一次 RPC
        # Detect file-reference keywords: use zero threshold directly, skip primary search to save one RPC
        is_file_ref = bool(_FILE_REF_PATTERN.search(query_text))
        attachment_threshold = 0.0 if is_file_ref else 0.45

        vec = await embed_text(query_text)
        vec_str = format_vector(vec)
        sb = get_supabase()

        # 附件块检索 + 对话记忆检索并发，互不阻塞
        # Concurrent attachment chunk search + conversation memory search
        chunk_res, memory_res = await asyncio.gather(
            _db(lambda: sb.rpc("search_attachment_chunks", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": attachment_top_k,
                "p_threshold": attachment_threshold,
            }).execute()),
            _db(lambda: sb.rpc("search_conversation_memories", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": memory_top_k,
                "p_threshold": 0.45,
                **({"p_exclude_thread_id": exclude_thread_id} if exclude_thread_id else {}),
            }).execute()),
        )

        chunks = chunk_res.data or []

        # 兜底：主检索无结果且尚未用零阈值时，去掉阈值再查一次
        # Fallback: if primary search returned nothing and zero-threshold wasn't already used, retry without threshold
        if not chunks and attachment_threshold > 0:
            fallback_res = await _db(lambda: sb.rpc("search_attachment_chunks", {
                "query_embedding": vec_str,
                "p_session_id": session_id,
                "p_top_k": attachment_top_k,
                "p_threshold": 0.0,
            }).execute())
            chunks = fallback_res.data or []

        # 文件偏好过滤：刚上传/发送文件后，只返回该文件的块；找不到块说明是内联文件，清空 attachment RAG
        # File preference filter: after uploading/sending a file, return only that file's chunks.
        # If no chunks exist for it, the file was sent inline (already in message history) —
        # suppress all attachment RAG to prevent old files from polluting the context.
        if prefer_filename:
            preferred = [c for c in chunks if c.get("filename") == prefer_filename]
            if preferred:
                # RAG 文件：找到了对应块，只用这些
                # RAG file: found matching chunks — use only those
                chunks = preferred
            else:
                # 该文件的块未进入 top-k，扩大搜索范围再过滤一次
                # The preferred file's chunks didn't make top-k; widen search and filter again
                wider_res = await _db(lambda: sb.rpc("search_attachment_chunks", {
                    "query_embedding": vec_str,
                    "p_session_id": session_id,
                    "p_top_k": attachment_top_k * 4,
                    "p_threshold": 0.0,
                }).execute())
                preferred = [c for c in (wider_res.data or []) if c.get("filename") == prefer_filename]
                if preferred:
                    # 扩大后找到了，只用这些
                    # Found after widening — use only those
                    chunks = preferred[:attachment_top_k]
                else:
                    # 完全没有 chunk：文件是内联模式，内容已在消息历史中
                    # 清空 attachment RAG，避免旧文件 chunk 混入 context 造成混淆
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
        return []  # RAG 失败不阻断正常对话 / RAG failure must not block the main conversation
