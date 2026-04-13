# tests/test_search_service.py
"""
搜索服务单元测试
Unit tests for the search service.

覆盖 / Covers:
  - inject_search_results：
      空结果直接返回原 context
      插入位置在最后一条 system 消息之后
      无 system 消息时插在开头
      content 截断到 200 字符
      多条结果全部出现在注入消息中
    inject_search_results:
      Empty results return context unchanged
      Insertion after the last system message
      Inserted at index 0 when no system messages exist
      Content truncated to 200 characters
      All results appear in the injected message
  - search：超时返回空列表、HTTP 错误返回空列表、正常结果解析
    search: timeout returns empty list, HTTP error returns empty list, normal result parsing
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── inject_search_results ─────────────────────────────────────────────

class TestInjectSearchResults:
    def test_empty_results_returns_context_unchanged(self):
        """空结果直接返回原 context，不插入任何消息 / Empty results return context unchanged."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统提示"},
            {"role": "user", "content": "用户问题"},
        ]
        result = inject_search_results(context, [])
        assert result == context

    def test_inserts_after_last_system_message(self):
        """搜索结果插在最后一条 system 消息之后 / Search results are inserted after the last system message."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统一"},
            {"role": "system", "content": "系统二"},
            {"role": "user", "content": "用户问题"},
        ]
        results = [{"title": "标题", "url": "http://example.com", "content": "内容"}]
        output = inject_search_results(context, results)

        # 找到注入消息的位置 / Find where the injected message was placed
        injected_idx = next(i for i, m in enumerate(output) if "联网搜索结果" in m["content"])
        # 应该在第二条 system 消息（index 1）之后，即 index 2
        # Should be after the second system message (index 1), i.e., at index 2
        assert injected_idx == 2

    def test_inserts_at_start_when_no_system_messages(self):
        """无 system 消息时搜索结果插在开头（index 0）/ Search results inserted at index 0 when no system messages exist."""
        from services.search_service import inject_search_results
        context = [
            {"role": "user", "content": "问题"},
            {"role": "assistant", "content": "回答"},
        ]
        results = [{"title": "标题", "url": "http://example.com", "content": "内容"}]
        output = inject_search_results(context, results)
        assert output[0]["role"] == "system"
        assert "联网搜索结果" in output[0]["content"]

    def test_content_truncated_to_200_chars(self):
        """content 超过 200 字符时截断 / Content longer than 200 characters is truncated."""
        from services.search_service import inject_search_results
        long_content = "X" * 500
        results = [{"title": "标题", "url": "http://example.com", "content": long_content}]
        output = inject_search_results([], results)
        injected = output[0]["content"]
        # 截断后 content 部分最多 200 字符
        # Truncated content should be at most 200 characters
        assert "X" * 201 not in injected
        assert "X" * 200 in injected

    def test_multiple_results_all_appear(self):
        """多条结果全部出现在注入的 system 消息中 / All multiple results appear in the injected system message."""
        from services.search_service import inject_search_results
        results = [
            {"title": "结果一", "url": "http://one.com", "content": "内容一"},
            {"title": "结果二", "url": "http://two.com", "content": "内容二"},
            {"title": "结果三", "url": "http://three.com", "content": "内容三"},
        ]
        output = inject_search_results([], results)
        injected = output[0]["content"]
        assert "结果一" in injected
        assert "结果二" in injected
        assert "结果三" in injected

    def test_result_without_content_still_shows_title_and_url(self):
        """content 为空的结果只展示标题和 URL / Results with empty content still show title and URL."""
        from services.search_service import inject_search_results
        results = [{"title": "只有标题", "url": "http://example.com", "content": ""}]
        output = inject_search_results([], results)
        injected = output[0]["content"]
        assert "只有标题" in injected
        assert "http://example.com" in injected

    def test_empty_context_with_results(self):
        """空 context 注入后产生单条 system 消息 / Empty context with results produces a single system message."""
        from services.search_service import inject_search_results
        results = [{"title": "T", "url": "http://u.com", "content": "C"}]
        output = inject_search_results([], results)
        assert len(output) == 1
        assert output[0]["role"] == "system"

    def test_original_context_messages_preserved(self):
        """注入后原 context 消息顺序和内容不变 / Original context messages are preserved in order after injection."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统提示"},
            {"role": "user", "content": "用户问题"},
            {"role": "assistant", "content": "AI 回答"},
        ]
        results = [{"title": "T", "url": "http://u.com", "content": "C"}]
        output = inject_search_results(context, results)
        # 原 3 条消息全部保留，加上注入的 1 条 = 4 条
        # Original 3 messages + 1 injected = 4 messages total
        assert len(output) == 4
        # 用户和 AI 消息仍在 / User and AI messages still present
        assert any(m["role"] == "user" for m in output)
        assert any(m["role"] == "assistant" for m in output)


# ── search ────────────────────────────────────────────────────────────

class TestSearch:
    @pytest.mark.asyncio
    async def test_timeout_returns_empty_list(self):
        """请求超时时返回空列表 / Returns empty list on request timeout."""
        import httpx
        from services.search_service import search

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            MockClient.return_value = mock_client

            result = await search("今天的新闻")

        assert result == []

    @pytest.mark.asyncio
    async def test_http_error_returns_empty_list(self):
        """HTTP 错误时返回空列表 / Returns empty list on HTTP error."""
        import httpx
        from services.search_service import search

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "500", request=MagicMock(), response=MagicMock()
            )
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await search("查询内容")

        assert result == []

    @pytest.mark.asyncio
    async def test_successful_search_parses_results(self):
        """正常响应解析出结果列表 / Successful response is parsed into result list."""
        from services.search_service import search

        fake_response_data = {
            "results": [
                {"title": "标题一", "url": "http://one.com", "content": "摘要一"},
                {"title": "标题二", "url": "http://two.com", "content": "摘要二"},
            ]
        }

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json.return_value = fake_response_data
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await search("查询问题")

        assert len(result) == 2
        assert result[0]["title"] == "标题一"
        assert result[0]["url"] == "http://one.com"
        assert result[1]["title"] == "标题二"

    @pytest.mark.asyncio
    async def test_max_results_limits_output(self):
        """max_results 参数限制返回条数 / max_results parameter limits the number of returned results."""
        from services.search_service import search

        # 生成 10 条结果 / Generate 10 results
        fake_response_data = {
            "results": [
                {"title": f"标题{i}", "url": f"http://site{i}.com", "content": f"内容{i}"}
                for i in range(10)
            ]
        }

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json.return_value = fake_response_data
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await search("查询", max_results=3)

        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_results_without_url_excluded(self):
        """无 URL 的结果被过滤掉 / Results without a URL are filtered out."""
        from services.search_service import search

        fake_response_data = {
            "results": [
                {"title": "有URL", "url": "http://valid.com", "content": "内容"},
                {"title": "无URL", "url": "", "content": "内容二"},
                {"title": "也无URL", "url": None, "content": "内容三"},
            ]
        }

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json.return_value = fake_response_data
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await search("查询")

        assert len(result) == 1
        assert result[0]["url"] == "http://valid.com"

    @pytest.mark.asyncio
    async def test_empty_results_key_returns_empty_list(self):
        """响应中 results 为空列表时返回空列表 / Returns empty list when response results is empty."""
        from services.search_service import search

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json.return_value = {"results": []}
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await search("冷门查询")

        assert result == []
