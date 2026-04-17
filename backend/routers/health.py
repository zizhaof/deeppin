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
            # 100 而不是 5：推理模型（groq gpt-oss / nvidia nemotron）会先吃 reasoning token，
            # 预算太小会导致 content 为空被误判失败
            # 100 instead of 5: reasoning models (groq gpt-oss / nvidia nemotron) spend budget on
            # reasoning tokens first; too-small cap leaves content empty and misclassifies as failed
            max_tokens=100,
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
    searxng_ok, supabase_ok, embedding_info = await asyncio.gather(
        _check_searxng(),
        _check_supabase(),
        _check_embedding(),
    )

    all_ok = searxng_ok and supabase_ok and embedding_info["ok"]
    body = {
        "status": "ok" if all_ok else "degraded",
        "components": {
            "backend": True,
            "searxng": searxng_ok,
            "supabase": supabase_ok,
            "embedding": embedding_info,
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


# ─── /health/providers/keys：零 quota 的 key + 模型清单校验 ──────────────
# Zero-quota key + model-catalog validation via each provider's GET /v1/models.
# 不消耗任何 LLM quota：只校验 key 是否合法 + 配置里声明的 model_id 是否仍在 provider 清单里。
# Does not consume LLM quota; validates key legitimacy and that configured model_ids still exist upstream.

# Provider -> (models_list_url, auth_style)
#   auth_style: "bearer" → Authorization: Bearer <key>
#               "query"  → ?key=<key>（Gemini）
_MODELS_ENDPOINTS: dict[str, tuple[str, str]] = {
    "groq":       ("https://api.groq.com/openai/v1/models",           "bearer"),
    "cerebras":   ("https://api.cerebras.ai/v1/models",               "bearer"),
    "sambanova":  ("https://api.sambanova.ai/v1/models",              "bearer"),
    "nvidia_nim": ("https://integrate.api.nvidia.com/v1/models",      "bearer"),
    "openrouter": ("https://openrouter.ai/api/v1/models",             "bearer"),
    "gemini":     ("https://generativelanguage.googleapis.com/v1beta/models", "query"),
}


def _extract_model_ids(provider: str, payload: dict) -> set[str]:
    """
    从各 provider 的 /models 响应提取模型 id 集合。
    Extract the set of model IDs from each provider's /models response.
    """
    if provider == "gemini":
        # {"models": [{"name": "models/gemini-2.5-flash", ...}, ...]}
        out = set()
        for m in payload.get("models", []):
            name = m.get("name", "")
            out.add(name.removeprefix("models/"))
        return out
    # OpenAI 兼容：{"data": [{"id": "..."}, ...]}
    return {m["id"] for m in payload.get("data", []) if m.get("id")}


async def _check_key_and_catalog(
    provider: str,
    api_key: str,
    configured_model_ids: set[str],
) -> dict:
    """
    对单个 (provider, key) 拉 /models：验证 key 合法 + 比对配置的模型是否仍挂在清单上。
    For a single (provider, key), fetch /models: validate key + diff configured models vs. upstream catalog.
    """
    endpoint = _MODELS_ENDPOINTS.get(provider)
    if endpoint is None:
        return {
            "provider": provider,
            "key": api_key[:8] + "...",
            "ok": False,
            "error": f"no /models endpoint configured for provider {provider}",
        }

    url, auth_style = endpoint
    params: dict | None = None
    headers: dict = {}
    if auth_style == "bearer":
        headers["Authorization"] = f"Bearer {api_key}"
    else:  # query
        params = {"key": api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=headers, params=params)
    except Exception as e:
        return {
            "provider": provider,
            "key": api_key[:8] + "...",
            "ok": False,
            "key_valid": False,
            "error": f"request failed: {e}",
        }

    if r.status_code in (401, 403):
        return {
            "provider": provider,
            "key": api_key[:8] + "...",
            "ok": False,
            "key_valid": False,
            "status_code": r.status_code,
            "error": f"key rejected: {r.text[:200]}",
        }
    if r.status_code != 200:
        return {
            "provider": provider,
            "key": api_key[:8] + "...",
            "ok": False,
            "key_valid": None,  # 不确定 / unknown
            "status_code": r.status_code,
            "error": f"unexpected status: {r.text[:200]}",
        }

    try:
        available = _extract_model_ids(provider, r.json())
    except Exception as e:
        return {
            "provider": provider,
            "key": api_key[:8] + "...",
            "ok": False,
            "key_valid": True,
            "error": f"failed to parse /models response: {e}",
        }

    missing = sorted(configured_model_ids - available)
    return {
        "provider": provider,
        "key": api_key[:8] + "...",
        "ok": not missing,
        "key_valid": True,
        "configured": sorted(configured_model_ids),
        "missing_models": missing,          # 配置里有但 provider 不再暴露 / configured but no longer upstream
        "available_count": len(available),
    }


@router.get("/health/providers/keys")
async def health_providers_keys():
    """
    零 quota key 合法性 + 模型清单校验。
    Zero-quota key validity + model-catalog drift check.

    每个 (provider, key) 拉一次 /v1/models（OpenAI 兼容）或等价端点（Gemini）：
      - 401/403 → key 失效 / key rejected
      - 200 → 比对配置里的 model_id 是否都还在 provider 返回的清单里
    For each (provider, key), fetch /models once and diff configured model_ids against the catalog.

    Quota 消耗：0 / Quota cost: zero.

    返回 / Returns:
      { "total": N, "ok": M, "failed": K, "results": [...] }
    """
    from services.llm_client import router as smart_router, ALL_MODELS

    # 每 provider 声明的 model_id 集合
    configured_by_provider: dict[str, set[str]] = {}
    for spec in ALL_MODELS:
        configured_by_provider.setdefault(spec.provider, set()).add(spec.model_id)

    # 按 (provider, key) 去重
    seen: set[tuple[str, str]] = set()
    pairs: list[tuple[str, str]] = []
    for slot in smart_router.slots:
        pair = (slot.spec.provider, slot.api_key)
        if pair not in seen:
            seen.add(pair)
            pairs.append(pair)

    results = await asyncio.gather(*[
        _check_key_and_catalog(p, k, configured_by_provider.get(p, set()))
        for p, k in pairs
    ])

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


@router.get("/health/providers/full")
async def health_providers_full():
    """
    逐个验证**每个**配置的 (provider, model, key) 三元组。
    Test **every** configured (provider, model, key) triple individually.

    与 /health/providers 的区别：不做 (provider, key) 去重，每个模型都单独测一次。
    Unlike /health/providers, no dedup by (provider, key); every model is tested.

    额度消耗较大，仅用于每日定时巡检或手动排查模型配置漂移。
    High quota cost; intended for daily scheduled checks or manual drift detection.

    返回 / Returns:
      { "total": N, "ok": M, "failed": K, "results": [...] }
      全部通过 → 200，有失败 → 503
    """
    from services.llm_client import router as smart_router

    results = await asyncio.gather(*[_check_single_slot(s) for s in smart_router.slots])

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
