# backend/tests/test_embedding_service.py
"""
验证 embedding_service 在换模型后的正确性。
确认：
  1. 单条 / 批量 embed 返回 1024 维向量
  2. 语义相近的句子余弦距离 < 语义不相关的句子
  3. 中文输入正常工作
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
    """每个测试前清空模型单例，避免测试间污染。"""
    import services.embedding_service as svc
    svc._model = None
    yield
    svc._model = None


@pytest.mark.asyncio
async def test_embed_text_dimension():
    """单条文本 embed 返回 1024 维向量。"""
    from services.embedding_service import embed_text
    vec = await embed_text("attention mechanism in transformers")
    assert len(vec) == 1024, f"期望 1024 维，实际 {len(vec)} 维"


@pytest.mark.asyncio
async def test_embed_texts_batch():
    """批量 embed 返回正确数量和维度。"""
    from services.embedding_service import embed_texts
    texts = ["hello world", "你好世界", "machine learning"]
    vecs = await embed_texts(texts)
    assert len(vecs) == 3
    for v in vecs:
        assert len(v) == 1024


@pytest.mark.asyncio
async def test_semantic_similarity():
    """语义相近的句子相似度 > 语义不相关的句子。"""
    from services.embedding_service import embed_texts
    vecs = await embed_texts([
        "multi-head attention mechanism",   # 查询
        "self-attention in neural networks", # 语义相近
        "the weather is nice today",         # 语义不相关
    ])
    query, similar, unrelated = vecs
    sim_close = cosine_similarity(query, similar)
    sim_far = cosine_similarity(query, unrelated)
    assert sim_close > sim_far, (
        f"期望相近句子相似度({sim_close:.3f}) > 不相关句子({sim_far:.3f})"
    )


@pytest.mark.asyncio
async def test_chinese_embedding():
    """中文输入正常返回 1024 维向量，且中文语义相近句相似度较高。"""
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
    """空列表输入返回空列表，不报错。"""
    from services.embedding_service import embed_texts
    result = await embed_texts([])
    assert result == []


def test_format_vector():
    """format_vector 输出正确的 pgvector 格式。"""
    from services.embedding_service import format_vector
    v = [0.1, -0.2, 0.3]
    result = format_vector(v)
    assert result.startswith("[")
    assert result.endswith("]")
    assert len(result.split(",")) == 3
