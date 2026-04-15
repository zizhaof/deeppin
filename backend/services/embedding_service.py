# backend/services/embedding_service.py
"""
向量嵌入服务 — sentence-transformers 单例封装
Vector embedding service — singleton wrapper for sentence-transformers.

模型 / Model: BAAI/bge-m3
  维度 / Dimensions: 1024
  支持中文 / Chinese support: yes (优化)
  大小 / Size: ~570 MB
  最大输入长度 / Max input length: 8192 tokens
  首次调用时从 HuggingFace Hub 自动下载，之后读本地缓存。
  Downloaded from HuggingFace Hub on first use; cached locally afterward.

所有 encode 调用均通过 run_in_executor 在线程池中执行，
不阻塞 asyncio event loop（encode 是 CPU 密集操作）。
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

# 全局单例和加载锁，保证多线程环境下只初始化一次
# Global singleton and load lock; ensures the model is initialized only once
_model: "_ST | None" = None
_model_lock = threading.Lock()


def _load_model() -> "_ST":
    """
    从 HuggingFace Hub 或本地缓存加载 sentence-transformers 模型。
    Load the sentence-transformers model from HuggingFace Hub or local cache.
    """
    from sentence_transformers import SentenceTransformer
    logger.info("加载 embedding 模型 %s … / Loading embedding model %s …", MODEL_NAME, MODEL_NAME)
    m = SentenceTransformer(MODEL_NAME)
    logger.info("embedding 模型加载完成 / Embedding model loaded")
    return m


def _get_model() -> "_ST":
    """
    获取模型单例（双重检查锁，线程安全）。
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
    同步批量编码，在线程池中调用，不在事件循环线程执行。
    Synchronous batch encoding; called from the thread pool, not the event loop thread.
    """
    model = _get_model()
    # normalize_embeddings=True 保证余弦相似度等价于点积，提高检索精度
    # normalize_embeddings=True ensures cosine similarity equals dot product, improving retrieval accuracy
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vecs.tolist()


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    批量向量化，返回 list[384-dim float list]。
    Embed a batch of texts; returns a list of 384-dimensional float vectors.
    """
    if not texts:
        return []
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _encode_sync, texts)


async def embed_text(text: str) -> list[float]:
    """
    单文本向量化。
    Embed a single text string.
    """
    results = await embed_texts([text])
    return results[0]


def format_vector(v: list[float]) -> str:
    """
    将 Python float list 格式化为 pgvector 文本格式 '[x,y,z,...]'。
    Format a Python float list into pgvector text format '[x,y,z,...]'.
    """
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"
