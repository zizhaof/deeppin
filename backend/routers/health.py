# backend/routers/health.py
"""
聚合健康检查端点
Aggregated health check endpoint.

GET /health
  → 检查 backend 自身 + 所有外部依赖（searxng、supabase）
  → Checks the backend itself and all external dependencies (searxng, supabase)
  → status: "ok" — 全部正常 / all healthy
  → status: "degraded" — 部分组件异常 / some components unhealthy
"""
from __future__ import annotations

import asyncio
import os

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from db.supabase import get_supabase

router = APIRouter()


async def _check_searxng() -> bool:
    """检查 SearXNG 是否可达。/ Check if SearXNG is reachable."""
    url = os.getenv("SEARXNG_URL", "http://searxng:8080").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{url}/healthz")
            return r.status_code == 200
    except Exception:
        return False


async def _check_embedding() -> dict:
    """
    验证 embedding 模型：embed 两个句子，检查维度和语义相似度。
    Verify the embedding model: embed two sentences, check dimensions and semantic similarity.
    """
    import math
    try:
        from services.embedding_service import embed_texts, MODEL_NAME
        vecs = await embed_texts([
            "attention mechanism in transformers",
            "self-attention neural network",
        ])
        dim = len(vecs[0])
        dot = sum(a * b for a, b in zip(vecs[0], vecs[1]))
        similarity = round(dot / (math.sqrt(sum(x*x for x in vecs[0])) * math.sqrt(sum(x*x for x in vecs[1]))), 3)
        ok = dim == 1024 and similarity > 0.5
        return {"ok": ok, "model": MODEL_NAME, "dim": dim, "similarity_probe": similarity}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_groq() -> dict:
    """
    用 summarizer 梯队发一条最小请求，验证 Groq API key 有效且可达。
    Send a minimal request via the summarizer tier to verify Groq API keys are valid and reachable.
    使用 summarizer 而非 chat，避免消耗高 TPM 配额。
    Uses summarizer rather than chat to avoid burning high-TPM quota.
    """
    try:
        from services.llm_client import _summarizer_call
        resp = await _summarizer_call(
            messages=[{"role": "user", "content": "Reply with the single word: ok"}],
            max_tokens=5,
        )
        ok = bool(resp and len(resp.strip()) > 0)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _check_single_slot(slot) -> dict:
    """
    对单个 slot 发最小请求，验证 provider + model + key 可用。
    Send a minimal request to a single slot to verify provider + model + key.
    """
    import litellm
    try:
        response = await litellm.acompletion(
            model=slot.litellm_model,
            messages=[{"role": "user", "content": "Reply with the single word: ok"}],
            api_key=slot.api_key,
            max_tokens=5,
            timeout=15,
        )
        text = (response.choices[0].message.content or "").strip()
        return {
            "provider": slot.spec.provider,
            "model": slot.spec.model_id,
            "key": slot.api_key[:8] + "...",
            "ok": bool(text),
        }
    except Exception as e:
        return {
            "provider": slot.spec.provider,
            "model": slot.spec.model_id,
            "key": slot.api_key[:8] + "...",
            "ok": False,
            "error": str(e)[:200],
        }


async def _check_supabase() -> bool:
    """检查 Supabase 连接是否正常。/ Check if the Supabase connection is healthy."""
    try:
        sb = get_supabase()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: sb.table("sessions").select("id").limit(1).execute(),
        )
        return True
    except Exception:
        return False


@router.get("/health")
async def health():
    """
    聚合健康检查：并发探测所有依赖，返回各组件状态。
    Aggregated health check: concurrently probe all dependencies and return per-component status.

    全部正常 → HTTP 200，status: "ok"
    任何依赖异常 → HTTP 503，status: "degraded"
    （Docker healthcheck 根据 HTTP 状态码判断 healthy/unhealthy）
    """
    searxng_ok, supabase_ok, embedding_info, groq_info = await asyncio.gather(
        _check_searxng(),
        _check_supabase(),
        _check_embedding(),
        _check_groq(),
    )

    all_ok = searxng_ok and supabase_ok and embedding_info["ok"] and groq_info["ok"]
    body = {
        "status": "ok" if all_ok else "degraded",
        "components": {
            "backend": True,
            "searxng": searxng_ok,
            "supabase": supabase_ok,
            "embedding": embedding_info,
            "groq": groq_info,
        },
    }
    # 503 让 Docker 将容器标记为 unhealthy，CI/CD 能感知到
    # Return 503 so Docker marks the container unhealthy when any dependency is down
    return JSONResponse(content=body, status_code=200 if all_ok else 503)


@router.get("/health/providers")
async def health_providers():
    """
    逐个验证每个 provider + model + key 组合是否可用。
    Test each provider + model + key combination individually.

    为避免重复测试同一 (provider, key) 对，每对只取一个模型。
    To avoid redundant tests, only one model per (provider, key) pair is tested.

    返回 / Returns:
      { "total": N, "ok": M, "failed": K, "results": [...] }
      全部通过 → 200，有失败 → 503
    """
    from services.llm_client import router as smart_router

    # 每个 (provider, key) 只测一个 slot，避免浪费额度
    # Test one slot per (provider, key) pair to conserve quota
    seen: set[tuple[str, str]] = set()
    slots_to_test = []
    for slot in smart_router.slots:
        pair = (slot.spec.provider, slot.api_key)
        if pair not in seen:
            seen.add(pair)
            slots_to_test.append(slot)

    results = await asyncio.gather(*[_check_single_slot(s) for s in slots_to_test])

    ok_count = sum(1 for r in results if r["ok"])
    failed_count = len(results) - ok_count

    body = {
        "total": len(results),
        "ok": ok_count,
        "failed": failed_count,
        "results": results,
    }
    return JSONResponse(
        content=body,
        status_code=200 if failed_count == 0 else 503,
    )
