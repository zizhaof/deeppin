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
from typing import Optional

logger = logging.getLogger(__name__)

# ── 分块参数 / Chunking parameters ───────────────────────────────────
CHUNK_SIZE    = 350   # 约 512 token（中文字符约 1.5 token/字）/ ~512 tokens (Chinese ~1.5 token/char)
CHUNK_OVERLAP = 50    # 块间重叠字符数，保证语义边界连续 / Overlap between chunks for semantic continuity
BATCH_INSERT  = 100   # Supabase PostgREST 单次 payload 上限 / Max rows per Supabase PostgREST insert

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

def chunk_text(text: str) -> list[str]:
    """
    使用 LangChain RecursiveCharacterTextSplitter 按语义边界切块。
    Split text into chunks using LangChain's RecursiveCharacterTextSplitter (semantic boundaries).

    fallback 为简单滑动窗口（langchain 未安装时使用）。
    Falls back to a simple sliding-window chunker if langchain is not available.
    """
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " ", ""],
        )
        return [c for c in splitter.split_text(text) if c.strip()]
    except ImportError:
        pass

    # Fallback：简单滑动窗口 / Simple sliding-window fallback
    if len(text) <= CHUNK_SIZE:
        return [text.strip()] if text.strip() else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(text[start:end].strip())
        if end == len(text):
            break  # 已到末尾，避免 start 不前进导致无限循环 / Reached end; break to avoid infinite loop
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

        # 长文本：分块 → 向量化 → 存库
        # Long text: chunk → embed → store
        chunks = chunk_text(text)
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
