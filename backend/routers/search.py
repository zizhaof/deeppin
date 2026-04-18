# backend/routers/search.py
"""
联网搜索端点
Web search endpoint.

POST /api/search
  → 调用 SearXNG 获取实时搜索结果
  → Calls SearXNG to fetch real-time search results
  → 将结果注入 context，用 chat 模型流式生成回答
  → Injects results into context and streams the AI response using the chat model
  → SSE 格式与 /api/threads/{id}/chat 完全一致，前端复用同一套解析逻辑
  → Same SSE format as /api/threads/{id}/chat; the frontend reuses the same parser
  → 搜索结果不写入 thread 消息历史（无状态查询）
  → Search results are NOT saved to the message history (stateless query)
  → SearXNG 不可用时自动降级为普通 AI 回答
  → Gracefully degrades to a plain AI answer when SearXNG is unavailable
"""
from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from dependencies.auth import get_current_user
from services.llm_client import chat_stream
from services.search_service import search as searxng_search

router = APIRouter()


class SearchRequest(BaseModel):
    """联网搜索请求体 / Request body for a web search."""
    query: str


@router.post("/search")
async def search_endpoint(body: SearchRequest, auth=Depends(get_current_user)):
    """
    执行联网搜索并流式返回 AI 回答。
    Perform a web search and stream back the AI-generated answer.
    """
    _user_id, _sb = auth
    return StreamingResponse(
        _search_stream(body.query),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲 / Disable Nginx buffering
        },
    )


async def _search_stream(query: str) -> AsyncGenerator[str, None]:
    """
    联网搜索流式生成器。
    Streaming generator for the web search flow.

    流程：ping → 搜索 → 注入结果 → 流式生成回答 → done
    Flow: ping → search → inject results → stream answer → done
    """
    yield _sse("ping", {})
    yield _sse("status", {"text": "正在搜索… / Searching…"})

    results = await searxng_search(query)

    if results:
        yield _sse("status", {"text": f"找到 {len(results)} 条结果，正在生成回答… / Found {len(results)} results, generating answer…"})
    else:
        yield _sse("status", {"text": "搜索无结果，直接回答… / No results found, answering directly…"})

    context = _build_context(query, results)

    # 流式生成：传 inject_meta=False，模型不会被要求输出 META 标签，
    # 搜索结果也不写 DB，因此可以直接 forward 每个 chunk。
    # Stream generation: inject_meta=False so the model is never instructed to
    # emit a META tag. Search results are not persisted, so each chunk can be
    # forwarded straight to the client.
    try:
        async for chunk in chat_stream(context, inject_meta=False):
            yield _sse("chunk", {"content": chunk})
    except Exception as exc:
        yield _sse("error", {"message": f"AI 生成失败 / AI generation failed: {exc}"})
        return

    yield _sse("done", {"message_id": None})


def _build_context(query: str, results: list[dict]) -> list[dict]:
    """
    将搜索结果格式化为 AI 可读的 system 消息列表。
    Format search results into a list of system messages readable by the AI.

    无结果时直接传入用户问题，让模型凭自身知识回答。
    When there are no results, the user question is passed directly and
    the model answers from its own knowledge.
    """
    if not results:
        return [{"role": "user", "content": query}]

    # 每条结果格式：[序号] 标题 / 来源 URL / 摘要
    # Each result format: [index] title / source URL / snippet
    formatted = "\n\n".join(
        f"[{i + 1}] {r['title']}\n来源：{r['url']}\n{r['content']}"
        for i, r in enumerate(results)
    )

    return [
        {
            "role": "system",
            "content": (
                "你是联网搜索助手。以下是针对用户问题的实时搜索结果，"
                "请基于搜索结果回答用户问题，用 [1][2] 等序号标注引用来源。\n\n"
                "You are a web search assistant. Below are real-time search results for the user's question. "
                "Answer based on these results and cite sources using [1][2] etc.\n\n"
                f"{formatted}"
            ),
        },
        {"role": "user", "content": query},
    ]


def _sse(event_type: str, data: dict) -> str:
    """
    将事件类型和数据序列化为 SSE 格式字符串。
    Serialize an event type and data dict into an SSE-format string.
    """
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"data: {payload}\n\n"
