# backend/services/search_service.py
"""
SearXNG 搜索服务封装
SearXNG search service wrapper.

调用本地 SearXNG 实例（Docker，127.0.0.1:8888），完全免费无限次。
Calls the local SearXNG instance (Docker, 127.0.0.1:8888); completely free and unlimited.

失败或超时时返回空列表，由调用方决定是否降级为普通 AI 回答。
Returns an empty list on failure or timeout; the caller decides whether to degrade gracefully.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

SEARXNG_URL = "http://localhost:8888"
_TIMEOUT = 5.0  # 超时秒数，超时降级为普通对话 / Timeout in seconds; falls back to plain AI on timeout


async def search(query: str, max_results: int = 5) -> list[dict]:
    """
    调用 SearXNG 搜索，返回 [{title, url, content}, ...]。
    Call SearXNG and return a list of {title, url, content} dicts.

    失败或超时返回空列表，由调用方决定是否降级。
    Returns an empty list on failure or timeout; the caller decides how to degrade.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
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

        return results

    except httpx.TimeoutException:
        logger.warning("SearXNG 搜索超时 / SearXNG search timed out (query=%r)", query)
        return []
    except Exception:
        logger.exception("SearXNG 搜索失败 / SearXNG search failed (query=%r)", query)
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

    lines = ["[联网搜索结果 / Web Search Results]"]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("content"):
            lines.append(f"   {r['content'][:200]}")
        lines.append(f"   来源 / Source: {r['url']}")

    search_msg = {"role": "system", "content": "\n".join(lines)}

    # 找到最后一条 system 消息的位置，插在其后
    # Find the position after the last system message and insert there
    insert_at = 0
    for i, msg in enumerate(context):
        if msg["role"] == "system":
            insert_at = i + 1

    return context[:insert_at] + [search_msg] + context[insert_at:]
