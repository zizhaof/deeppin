# backend/tests/test_embedding_service.py
"""
Verify embedding_service correctness after the model swap.
Asserts:
  1. Single / batch embed returns 1024-dim vectors
  2. Semantically close sentences have smaller cosine distance than unrelated ones
  3. Chinese input works correctly
"""
import math
import pytest
from unittest.mock import patch, MagicMock


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


@pytest.fixture(autouse=True)
def reset_model_singleton():
    """Clear the model singleton before each test to avoid cross-test pollution."""
    import services.embedding_service as svc
    svc._model = None
    yield
    svc._model = None


@pytest.mark.asyncio
async def test_embed_text_dimension():
    """Single-text embed returns a 1024-dim vector."""
    from services.embedding_service import embed_text
    vec = await embed_text("attention mechanism in transformers")
    assert len(vec) == 1024, f"期望 1024 维，实际 {len(vec)} 维"


@pytest.mark.asyncio
async def test_embed_texts_batch():
    """Batch embed returns the correct count and dimensionality."""
    from services.embedding_service import embed_texts
    texts = ["hello world", "你好世界", "machine learning"]
    vecs = await embed_texts(texts)
    assert len(vecs) == 3
    for v in vecs:
        assert len(v) == 1024


@pytest.mark.asyncio
async def test_semantic_similarity():
    """Semantically close sentences have higher similarity than unrelated ones."""
    from services.embedding_service import embed_texts
    vecs = await embed_texts([
        "multi-head attention mechanism",   # Query
        "self-attention in neural networks", # Semantically close
        "the weather is nice today",         # Unrelated
    ])
    query, similar, unrelated = vecs
    sim_close = cosine_similarity(query, similar)
    sim_far = cosine_similarity(query, unrelated)
    assert sim_close > sim_far, (
        f"期望相近句子相似度({sim_close:.3f}) > 不相关句子({sim_far:.3f})"
    )


@pytest.mark.asyncio
async def test_chinese_embedding():
    """Chinese input returns 1024-dim vectors and semantically close Chinese sentences score high."""
    from services.embedding_service import embed_texts
    vecs = await embed_texts([
        "注意力机制是 Transformer 的核心",
        "自注意力让模型关注序列中的重要部分",
        "今天天气很好",
    ])
    query, similar, unrelated = vecs
    assert len(query) == 1024
    sim_close = cosine_similarity(query, similar)
    sim_far = cosine_similarity(query, unrelated)
    assert sim_close > sim_far


@pytest.mark.asyncio
async def test_embed_empty_list():
    """Empty list input returns an empty list without raising."""
    from services.embedding_service import embed_texts
    result = await embed_texts([])
    assert result == []


def test_format_vector():
    """format_vector outputs the correct pgvector format."""
    from services.embedding_service import format_vector
    v = [0.1, -0.2, 0.3]
    result = format_vector(v)
    assert result.startswith("[")
    assert result.endswith("]")
    assert len(result.split(",")) == 3
