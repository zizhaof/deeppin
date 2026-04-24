# backend/services/embedding_service.py
"""
Vector embedding service — singleton wrapper for sentence-transformers.

Model: BAAI/bge-m3
  Dimensions: 1024
  Chinese support: yes (optimized)
  Size: ~570 MB
  Max input length: 8192 tokens
  Downloaded from HuggingFace Hub on first use; cached locally afterward.

All encode calls go through run_in_executor in a thread pool,
All encode calls run in a thread-pool executor via run_in_executor
to avoid blocking the asyncio event loop (encode is CPU-intensive).
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer as _ST

logger = logging.getLogger(__name__)

MODEL_NAME = "BAAI/bge-m3"

# Global singleton and load lock; ensures the model is initialized only once
_model: "_ST | None" = None
_model_lock = threading.Lock()


def _load_model() -> "_ST":
    """
    Load the sentence-transformers model from HuggingFace Hub or local cache.
    """
    from sentence_transformers import SentenceTransformer
    logger.info("加载 embedding 模型 %s … / Loading embedding model %s …", MODEL_NAME, MODEL_NAME)
    m = SentenceTransformer(MODEL_NAME)
    logger.info("embedding 模型加载完成 / Embedding model loaded")
    return m


def _get_model() -> "_ST":
    """
    Return the model singleton using double-checked locking (thread-safe).
    """
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = _load_model()
    return _model


def _encode_sync(texts: list[str]) -> list[list[float]]:
    """
    Synchronous batch encoding; called from the thread pool, not the event loop thread.
    """
    model = _get_model()
    # normalize_embeddings=True ensures cosine similarity equals dot product, improving retrieval accuracy
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vecs.tolist()


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a batch of texts; returns a list of 1024-dimensional float vectors.
    """
    if not texts:
        return []
    from services.metrics import EMBEDDING_CALLS, EMBEDDING_DURATION, EMBEDDING_CHARS
    loop = asyncio.get_running_loop()
    with EMBEDDING_DURATION.time():
        try:
            result = await loop.run_in_executor(None, _encode_sync, texts)
        except Exception:
            EMBEDDING_CALLS.labels("error").inc()
            raise
    EMBEDDING_CALLS.labels("ok").inc()
    EMBEDDING_CHARS.inc(sum(len(t) for t in texts))
    return result


async def embed_text(text: str) -> list[float]:
    """
    Embed a single text string.
    """
    results = await embed_texts([text])
    return results[0]


def format_vector(v: list[float]) -> str:
    """
    Format a Python float list into pgvector text format '[x,y,z,...]'.
    """
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"
