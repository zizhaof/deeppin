# backend/services/attachment_processor.py
"""
附件处理流水线
Attachment processing pipeline.

流程 / Flow:
  上传字节 → 文本提取（Kreuzberg / fallback）→ 分块 → 向量化 → 存库
  Raw bytes → text extraction (Kreuzberg / fallback) → chunking → embedding → DB storage

原始文件字节在函数执行完后自动释放，不写磁盘。
Raw file bytes are released after the function returns; nothing is written to disk.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── 分块参数 / Chunking parameters ───────────────────────────────────
CHUNK_SIZE    = 350   # 固定切分的 fallback chunk 大小 / Chunk size for fixed-size fallback
CHUNK_OVERLAP = 50    # 固定切分块间重叠字符数 / Overlap for fixed-size fallback
BATCH_INSERT  = 100   # Supabase PostgREST 单次 payload 上限 / Max rows per Supabase PostgREST insert

# 语义切分参数 / Semantic chunking parameters
SEMANTIC_THRESHOLD = 0.75   # 相邻句子余弦相似度低于此值时切断 / Cut when adjacent-sentence cosine similarity drops below this
MAX_CHUNK_CHARS    = 600    # 单个 chunk 最大字符数（防止合并过长）/ Max chars per chunk to avoid oversized chunks
MIN_CHUNK_CHARS    = 50     # chunk 最小字符数，过短则继续合并 / Min chars; shorter chunks are merged into the next

# 内联阈值：提取文本不超过此长度时直接作为消息 context，不进 RAG
# Inline threshold: text shorter than this is passed as message context, not fed into RAG
INLINE_THRESHOLD = 3_000  # 与 context_builder._MAX_SINGLE_MSG_CHARS 保持一致

# 可直接 UTF-8 解码的纯文本扩展名
# File extensions that can be decoded directly as UTF-8 text
_TEXT_EXTS = {
    "txt", "md", "csv", "json", "xml", "html", "htm",
    "py", "ts", "tsx", "js", "jsx", "css",
    "yaml", "yml", "toml", "ini", "sh", "sql",
}

# Kreuzberg MIME 类型映射表（按扩展名路由）
# MIME type map for Kreuzberg (keyed by file extension)
_MIME_MAP = {
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc":  "application/msword",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "html": "text/html",
    "htm":  "text/html",
    "txt":  "text/plain",
    "md":   "text/markdown",
    "csv":  "text/csv",
}


# ── 文本提取 / Text extraction ────────────────────────────────────────

async def extract_text(content: bytes, filename: str) -> str:
    """
    从文件字节提取纯文本。
    Extract plain text from raw file bytes.

    优先 Kreuzberg（异步，88+ 格式），失败则 fallback 到 pypdf / python-docx。
    Tries Kreuzberg first (async, 88+ formats); falls back to pypdf or python-docx on failure.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # 1. Kreuzberg（支持 PDF / Office / 邮件等复杂格式）
    #    Kreuzberg (supports PDF, Office, email, and many other complex formats)
    try:
        from kreuzberg import extract_bytes as _kb_extract
        mime_type = _MIME_MAP.get(ext, "application/octet-stream")
        result = await _kb_extract(content, mime_type)
        if result.content and result.content.strip():
            return result.content.strip()
    except ImportError:
        pass  # kreuzberg 未安装，走 fallback / kreuzberg not installed; use fallback
    except Exception as e:
        logger.warning("Kreuzberg 提取失败（%s），走 fallback / Kreuzberg extraction failed (%s), falling back: %s", filename, filename, e)

    # 2. Fallback：按扩展名路由到对应解析库
    #    Fallback: route to the appropriate parsing library by extension
    if ext in _TEXT_EXTS:
        return content.decode("utf-8", errors="replace")
    elif ext == "pdf":
        return _extract_pdf(content)
    elif ext in ("docx", "doc"):
        return _extract_docx(content)
    else:
        # 未知格式，尝试 UTF-8 解码
        # Unknown format; attempt UTF-8 decode
        return content.decode("utf-8", errors="replace")


def _extract_pdf(content: bytes) -> str:
    """
    使用 pypdf 从 PDF 字节提取文本（Kreuzberg fallback）。
    Extract text from PDF bytes using pypdf (Kreuzberg fallback).
    """
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = [p.extract_text() or "" for p in reader.pages]
        return "\n\n".join(p for p in pages if p.strip())
    except ImportError:
        raise RuntimeError("pypdf 未安装，无法解析 PDF / pypdf is not installed; cannot parse PDF")


def _extract_docx(content: bytes) -> str:
    """
    使用 python-docx 从 DOCX 字节提取文本（Kreuzberg fallback）。
    Extract text from DOCX bytes using python-docx (Kreuzberg fallback).
    """
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        paras = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paras)
    except ImportError:
        raise RuntimeError("python-docx 未安装，无法解析 DOCX / python-docx is not installed; cannot parse DOCX")


# ── 文本分块 / Text chunking ──────────────────────────────────────────

# 句子切分正则：中英文句末标点后切断
# Sentence-splitting regex: cut after Chinese/English sentence-ending punctuation
_SENT_SPLIT_RE = re.compile(r'(?<=[。！？.!?])\s*')


def _split_sentences(text: str) -> list[str]:
    """
    将文本按段落和句子边界切成句子列表（中英文混合）。
    Split text into sentences at paragraph and sentence-ending punctuation boundaries.

    先按空行分段，再在每段内按句末标点切句，过滤空串。
    First splits on blank lines (paragraph breaks), then on sentence-ending punctuation within each paragraph.
    """
    sentences: list[str] = []
    for para in re.split(r'\n\s*\n', text):
        para = para.strip()
        if not para:
            continue
        for sent in _SENT_SPLIT_RE.split(para):
            sent = sent.strip()
            if sent:
                sentences.append(sent)
    return sentences


async def chunk_text_semantic(text: str) -> list[str]:
    """
    基于 embedding 余弦相似度的语义切分。
    Semantic chunking based on embedding cosine similarity.

    流程 / Flow:
      1. 按句子边界切分 → sentences
      2. 一次批量 embed 所有句子（bge-m3 已 normalize，点积 = 余弦相似度）
      3. 相邻句子相似度 < SEMANTIC_THRESHOLD 时视为语义断点，切断
      4. 合并句子成 chunk，控制最大长度 MAX_CHUNK_CHARS

    出错时 fallback 到固定大小切分。
    Falls back to fixed-size chunking on any error.
    """
    from services.embedding_service import embed_texts

    sentences = _split_sentences(text)
    if not sentences:
        return []
    if len(sentences) == 1:
        return [sentences[0]] if len(sentences[0]) >= MIN_CHUNK_CHARS else []

    try:
        # 一次调用批量 embed，避免多次 executor 调度开销
        # Single batch embed call — avoids repeated executor dispatch overhead
        embeddings = await embed_texts(sentences)

        chunks: list[str] = []
        current: list[str] = [sentences[0]]
        current_len: int = len(sentences[0])

        for i in range(1, len(sentences)):
            sent = sentences[i]
            sent_len = len(sent)

            # 点积即余弦相似度（向量已 L2 归一化）
            # Dot product equals cosine similarity because vectors are L2-normalized
            sim: float = sum(a * b for a, b in zip(embeddings[i - 1], embeddings[i]))

            # 语义跳跃 或 chunk 会超长 → 切断（但当前 chunk 需达到最小长度才切）
            # Break on semantic jump or size overflow (only if current chunk meets MIN_CHUNK_CHARS)
            should_break = (
                sim < SEMANTIC_THRESHOLD or current_len + sent_len > MAX_CHUNK_CHARS
            ) and current_len >= MIN_CHUNK_CHARS

            if should_break:
                chunks.append("".join(current))
                current = [sent]
                current_len = sent_len
            else:
                current.append(sent)
                current_len += sent_len

        if current:
            tail = "".join(current)
            # 尾部 chunk 过短时合并到前一块，避免孤立的碎片进入向量库
            # Merge a too-short tail chunk into the previous one to avoid tiny orphan chunks
            if chunks and len(tail) < MIN_CHUNK_CHARS:
                chunks[-1] += tail
            else:
                chunks.append(tail)

        return [c for c in chunks if c.strip()]

    except Exception as e:
        logger.warning("语义切分失败，fallback 到固定切分 / Semantic chunking failed, falling back: %s", e)
        return _chunk_fixed(text)


def _chunk_fixed(text: str) -> list[str]:
    """
    固定大小滑动窗口切分（语义切分的 fallback）。
    Fixed-size sliding-window chunker (fallback for semantic chunking).
    """
    if len(text) <= CHUNK_SIZE:
        return [text.strip()] if text.strip() else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(text[start:end].strip())
        if end == len(text):
            break
        start = end - CHUNK_OVERLAP
        if start <= 0:
            break
    return [c for c in chunks if c]


# ── 存库 / Database storage ───────────────────────────────────────────

async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


async def _store_chunks(
    session_id: str,
    filename: str,
    chunks: list[str],
    embeddings: list[list[float]],
) -> None:
    """
    将文本块和对应向量分批写入 attachment_chunks 表。
    Batch-insert text chunks and their embeddings into the attachment_chunks table.

    分批大小由 BATCH_INSERT 控制，避免超过 PostgREST payload 限制。
    Batch size is controlled by BATCH_INSERT to stay within PostgREST payload limits.
    """
    from db.supabase import get_supabase
    from services.embedding_service import format_vector

    sb = get_supabase()
    rows = [
        {
            "session_id": session_id,
            "filename": filename,
            "chunk_index": i,
            "content": chunk,
            "embedding": format_vector(emb),
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]

    # 分批写入，避免超过 PostgREST payload 限制
    # Insert in batches to avoid exceeding the PostgREST payload limit
    for i in range(0, len(rows), BATCH_INSERT):
        batch = rows[i : i + BATCH_INSERT]
        await _db(lambda b=batch: sb.table("attachment_chunks").insert(b).execute())


# ── 主入口 / Main entry point ─────────────────────────────────────────

async def process_attachment(
    session_id: str,
    filename: str,
    content: bytes,
) -> dict:
    """
    完整处理流水线，根据提取文本长度决定走内联还是 RAG。
    Full processing pipeline; routes to inline or RAG based on extracted text length.

    返回值 / Return value:
      {
        "chunk_count": int,          # RAG 模式写入的块数；内联/失败时为 0
        "inline_text": str | None,   # 内联模式时为完整提取文本；RAG 模式或失败时为 None
      }

    判断逻辑 / Decision logic:
      len(text) <= INLINE_THRESHOLD  → inline：文本直接作为消息 context，不进向量库
      len(text) >  INLINE_THRESHOLD  → RAG：分块 → 向量化 → 存库，由检索注入 context
    """
    try:
        text = await extract_text(content, filename)
        if not text.strip():
            logger.warning("附件 %s 提取文本为空 / Attachment %s yielded empty text", filename, filename)
            return {"chunk_count": 0, "inline_text": None}

        # 短文本直接内联，无需向量化
        # Short text: pass inline as context, skip chunking/embedding
        if len(text) <= INLINE_THRESHOLD:
            logger.info("附件 %s 内联模式（%d 字符）/ Attachment %s inline mode (%d chars)",
                        filename, len(text), filename, len(text))
            return {"chunk_count": 0, "inline_text": text.strip()}

        # 长文本：语义分块 → 向量化 → 存库
        # Long text: semantic chunk → embed → store
        chunks = await chunk_text_semantic(text)
        if not chunks:
            return {"chunk_count": 0, "inline_text": None}

        from services.embedding_service import embed_texts
        embeddings = await embed_texts(chunks)

        await _store_chunks(session_id, filename, chunks, embeddings)
        logger.info("附件 %s RAG 模式：%d 块，session=%s / Attachment %s RAG mode: %d chunks, session=%s",
                    filename, len(chunks), session_id, filename, len(chunks), session_id)
        return {"chunk_count": len(chunks), "inline_text": None}

    except Exception:
        logger.exception("附件 %s 处理失败（session=%s）/ Attachment %s processing failed (session=%s)",
                         filename, session_id, filename, session_id)
        return {"chunk_count": 0, "inline_text": None}
