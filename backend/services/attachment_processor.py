# backend/services/attachment_processor.py
"""
Attachment processing pipeline.

Flow:
  Raw bytes → text extraction (Kreuzberg / fallback) → chunking → embedding → DB storage

Raw file bytes are released after the function returns; nothing is written to disk.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Chunking parameters ───────────────────────────────────
CHUNK_SIZE    = 350   # Chunk size for fixed-size fallback
CHUNK_OVERLAP = 50    # Overlap for fixed-size fallback
BATCH_INSERT  = 100   # Max rows per Supabase PostgREST insert

# Semantic chunking parameters
SEMANTIC_THRESHOLD = 0.75   # Cut when adjacent-sentence cosine similarity drops below this
MAX_CHUNK_CHARS    = 600    # Max chars per chunk to avoid oversized chunks
MIN_CHUNK_CHARS    = 50     # Min chars; shorter chunks are merged into the next

# Inline threshold: text shorter than this is passed as message context, not fed into RAG
INLINE_THRESHOLD = 3_000  # Keep aligned with context_builder._MAX_SINGLE_MSG_CHARS

# Image extensions → MIME; routed to the vision model for text description
# Keys must match _sniff_format's canonical names
_IMAGE_MIME = {
    "png":  "image/png",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif":  "image/gif",
    "bmp":  "image/bmp",
}

# Prompt for image description
_IMAGE_DESCRIBE_PROMPT = (
    "请详细描述这张图片的内容，包括：可见的文字（逐字转录）、图表/表格中的数据、"
    "主要物体与布局、风格与氛围。如果是文档或屏幕截图，优先完整转录所有文字。"
    "只输出描述本身，不要加任何前言或结语。"
)

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


def _sniff_format(content: bytes) -> Optional[str]:
    """
    Sniff the real format from file header bytes and return a canonical ext.

    Handles files with missing or misleading extensions.
    Returns one of: png, jpeg, gif, webp, bmp, pdf, zip (DOCX/XLSX/PPTX inner format), None
    """
    if len(content) < 4:
        return None
    head = content[:12]
    # Images
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[:4] == b"RIFF" and len(content) >= 12 and head[8:12] == b"WEBP":
        return "webp"
    if head[:2] == b"BM":
        return "bmp"
    # Documents
    if head[:4] == b"%PDF":
        return "pdf"
    if head[:4] == b"PK\x03\x04":
        # DOCX / XLSX / PPTX
        # DOCX/XLSX/PPTX/ODF are zip containers; Kreuzberg inspects inner structure
        return "zip"
    return None


# Text extraction ────────────────────────────────────────

async def extract_text(content: bytes, filename: str) -> str:
    """
    Extract plain text from raw file bytes.

    Sniffs the real format from header bytes first (does not trust the filename).
    Images are routed to the vision model; other binaries go through Kreuzberg with
    pypdf / python-docx fallbacks, ultimately falling back to UTF-8 decode.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    sniffed = _sniff_format(content)

    #    Images (trust byte sniff, not the extension) → vision model description
    if sniffed in _IMAGE_MIME:
        return await _extract_image(content, sniffed)

    #    Kreuzberg (PDF / Office / email); prefer sniffed MIME; zip-based formats need the exact MIME
    mime_type = (
        _MIME_MAP.get(ext) if sniffed == "zip" and ext in _MIME_MAP
        else _MIME_MAP.get(sniffed or "") or _MIME_MAP.get(ext) or "application/octet-stream"
    )

    try:
        from kreuzberg import extract_bytes as _kb_extract
        result = await _kb_extract(content, mime_type)
        if result.content and result.content.strip():
            return result.content.strip()
    except ImportError:
        pass  # kreuzberg not installed; use fallback
    except Exception as e:
        logger.warning("Kreuzberg 提取失败 %s，走 fallback / Kreuzberg extraction failed, falling back: %s", filename, e)

    #    Fallback: prefer sniffed format, then filename extension
    if sniffed == "pdf" or ext == "pdf":
        return _extract_pdf(content)
    if ext in ("docx", "doc"):
        return _extract_docx(content)
    # Text or unknown format: attempt UTF-8 decode (garbled but safe for binary)
    return content.decode("utf-8", errors="replace")


def _extract_pdf(content: bytes) -> str:
    """
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
    Extract text from DOCX bytes using python-docx (Kreuzberg fallback).
    """
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        paras = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paras)
    except ImportError:
        raise RuntimeError("python-docx 未安装，无法解析 DOCX / python-docx is not installed; cannot parse DOCX")


async def _extract_image(content: bytes, ext: str) -> str:
    """
    Ask the vision model to describe the image, then feed the result through the
    same length-based branching as regular attachments.

    Returns an empty string on failure, which process_attachment treats as an
    extraction failure (chunk_count=0, inline_text=null).
    """
    from services.llm_client import vision_chat

    mime = _IMAGE_MIME.get(ext, "application/octet-stream")
    data_url = f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _IMAGE_DESCRIBE_PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]

    try:
        description = await vision_chat(messages)
        return (description or "").strip()
    except Exception as e:
        logger.warning("图片识别失败（%s）/ Image recognition failed (%s): %s", ext, ext, e)
        return ""


# Text chunking ──────────────────────────────────────────

# Sentence-splitting regex: cut after Chinese/English sentence-ending punctuation
_SENT_SPLIT_RE = re.compile(r'(?<=[。！？.!?])\s*')


def _split_sentences(text: str) -> list[str]:
    """
    Split text into sentences at paragraph and sentence-ending punctuation boundaries.

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
    Semantic chunking based on embedding cosine similarity.

    Flow:
      1. Split by sentence boundaries -> sentences
      2. Batch-embed all sentences once (bge-m3 is normalized; dot product = cosine similarity)
      3. When adjacent-sentence similarity < SEMANTIC_THRESHOLD, treat as a semantic break and cut
      4. Merge sentences into chunks while keeping length under MAX_CHUNK_CHARS

    Falls back to fixed-size chunking on any error.
    """
    from services.embedding_service import embed_texts

    sentences = _split_sentences(text)
    if not sentences:
        return []
    if len(sentences) == 1:
        return [sentences[0]] if len(sentences[0]) >= MIN_CHUNK_CHARS else []

    try:
        # Single batch embed call — avoids repeated executor dispatch overhead
        embeddings = await embed_texts(sentences)

        chunks: list[str] = []
        current: list[str] = [sentences[0]]
        current_len: int = len(sentences[0])

        for i in range(1, len(sentences)):
            sent = sentences[i]
            sent_len = len(sent)

            # Dot product equals cosine similarity because vectors are L2-normalized
            sim: float = sum(a * b for a, b in zip(embeddings[i - 1], embeddings[i]))

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


# Database storage ───────────────────────────────────────────

async def _db(fn):
    """
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
    Batch-insert text chunks and their embeddings into the attachment_chunks table.

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

    # Insert in batches to avoid exceeding the PostgREST payload limit
    for i in range(0, len(rows), BATCH_INSERT):
        batch = rows[i : i + BATCH_INSERT]
        await _db(lambda b=batch: sb.table("attachment_chunks").insert(b).execute())


# Main entry point ─────────────────────────────────────────

async def process_attachment(
    session_id: str,
    filename: str,
    content: bytes,
) -> dict:
    """
    Full processing pipeline; routes to inline or RAG based on extracted text length.

    Return value:
      {
        "chunk_count": int,          # Chunks written in RAG mode; 0 for inline / failure
        "inline_text": str
      }

    Decision logic:
      len(text) <= INLINE_THRESHOLD  -> inline: text used directly as message context, not stored in vector DB
      len(text) >  INLINE_THRESHOLD  -> RAG: chunk -> embed -> persist; injected into context via retrieval
    """
    try:
        text = await extract_text(content, filename)
        if not text.strip():
            logger.warning("附件提取文本为空 / Attachment yielded empty text: %s", filename)
            return {"chunk_count": 0, "inline_text": None}

        # Short text: pass inline as context, skip chunking/embedding
        if len(text) <= INLINE_THRESHOLD:
            logger.info("附件内联模式 / Attachment inline: %s (%d chars)", filename, len(text))
            return {"chunk_count": 0, "inline_text": text.strip()}

        # Long text: semantic chunk → embed → store
        chunks = await chunk_text_semantic(text)
        if not chunks:
            return {"chunk_count": 0, "inline_text": None}

        from services.embedding_service import embed_texts
        embeddings = await embed_texts(chunks)

        await _store_chunks(session_id, filename, chunks, embeddings)
        logger.info("附件 RAG 模式 / Attachment RAG: %s (%d chunks, session=%s)",
                    filename, len(chunks), session_id)
        return {"chunk_count": len(chunks), "inline_text": None}

    except Exception:
        logger.exception("附件处理失败 / Attachment processing failed: %s (session=%s)",
                         filename, session_id)
        return {"chunk_count": 0, "inline_text": None}
