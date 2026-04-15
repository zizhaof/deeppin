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
    """
    searxng_ok, supabase_ok = await asyncio.gather(
        _check_searxng(),
        _check_supabase(),
    )

    all_ok = searxng_ok and supabase_ok
    return {
        "status": "ok" if all_ok else "degraded",
        "components": {
            "backend": True,
            "searxng": searxng_ok,
            "supabase": supabase_ok,
        },
    }
