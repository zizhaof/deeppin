# backend/services/search_service.py
"""
SearXNG 搜索服务封装
SearXNG search service wrapper.

地址由环境变量 SEARXNG_URL 控制，默认 http://searxng:8080（Docker Compose 服务名）。
本地开发时可设 SEARXNG_URL=http://localhost:8888 覆盖。
URL controlled by SEARXNG_URL env var; defaults to http://searxng:8080 (Docker Compose service name).
For local development, override with SEARXNG_URL=http://localhost:8888.

失败或超时时返回空列表，由调用方决定是否降级为普通 AI 回答。
Returns an empty list on failure or timeout; the caller decides whether to degrade gracefully.
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

# 环境变量优先，默认使用 Docker Compose 服务名（容器内 localhost 指向自身，不能用）
# Env var takes priority; default uses the Docker Compose service name
# (localhost inside a container refers to itself, not other services)
SEARXNG_URL = os.getenv("SEARXNG_URL", "http://searxng:8080")
_TIMEOUT = 5.0  # 超时秒数，超时降级为普通对话 / Timeout in seconds; falls back to plain AI on timeout

# 持久化 httpx 客户端，避免每次搜索都创建/销毁连接池
# Persistent httpx client — avoids creating/destroying the connection pool on each search
_http_client: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    """获取或创建持久化 httpx 客户端 / Get or create the persistent httpx client."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=_TIMEOUT)
    return _http_client


async def close_http_client() -> None:
    """关闭持久化 httpx 客户端（供 shutdown handler 调用）/ Close the client (called by shutdown handler)."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


async def search(query: str, max_results: int = 5) -> list[dict]:
    """
    调用 SearXNG 搜索，返回 [{title, url, content}, ...]。
    Call SearXNG and return a list of {title, url, content} dicts.

    失败或超时返回空列表，由调用方决定是否降级。
    Returns an empty list on failure or timeout; the caller decides how to degrade.
    """
    from services.metrics import SEARXNG_CALLS, SEARXNG_DURATION
    with SEARXNG_DURATION.time():
        try:
            client = _get_http()
            resp = await client.get(
                f"{SEARXNG_URL}/search",
                params={
                    "q": query,
                    "format": "json",
                    "language": "auto",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            results = []
            for item in (data.get("results") or [])[:max_results]:
                title = (item.get("title") or "").strip()
                url = (item.get("url") or "").strip()
                content = (item.get("content") or "").strip()
                if url:
                    results.append({"title": title, "url": url, "content": content})

            SEARXNG_CALLS.labels("ok").inc()
            return results

        except httpx.TimeoutException:
            SEARXNG_CALLS.labels("timeout").inc()
            logger.warning("SearXNG 搜索超时 (url=%s, query=%r) / timed out", SEARXNG_URL, query)
            return []
        except Exception:
            SEARXNG_CALLS.labels("error").inc()
            logger.exception("SearXNG 搜索失败 (url=%s, query=%r) / failed", SEARXNG_URL, query)
            return []


def inject_search_results(context: list[dict], results: list[dict]) -> list[dict]:
    """
    将搜索结果作为 system 消息注入 context。
    Inject search results as a system message into the context list.

    插入位置：扫描所有消息找到最后一条 system 消息的位置后面，
    使搜索结果紧贴对话历史之前，无论 system 消息是否连续分布。
    Insertion point: after the last system message found by scanning all messages,
    so search results sit just before the conversation history
    regardless of whether system messages are contiguous.
    """
    if not results:
        return context

    lines = [
        "IMPORTANT: The system has performed a live web search on your behalf.",
        "The following results contain real-time information retrieved right now.",
        "You MUST use these results to answer the user's question directly.",
        "Do NOT say you cannot access the internet or lack real-time data — you have it below.",
        "",
        "[联网搜索结果 / Live Web Search Results]",
    ]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("content"):
            lines.append(f"   {r['content'][:300]}")
        lines.append(f"   来源 / Source: {r['url']}")

    search_msg = {"role": "system", "content": "\n".join(lines)}

    # 找到最后一条 system 消息的位置，插在其后
    # Find the position after the last system message and insert there
    insert_at = 0
    for i, msg in enumerate(context):
        if msg["role"] == "system":
            insert_at = i + 1

    return context[:insert_at] + [search_msg] + context[insert_at:]
