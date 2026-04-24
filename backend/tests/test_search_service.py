# tests/test_search_service.py
"""
Unit tests for the search service.

  - inject_search_results：
      Empty results return the original context unchanged
      Insertion point is after the last system message
      When there is no system message, insert at the beginning
      content is truncated to 200 characters
    inject_search_results:
      Empty results return context unchanged
      Insertion after the last system message
      Inserted at index 0 when no system messages exist
      Content truncated to 200 characters
      All results appear in the injected message
    search: timeout returns empty list, HTTP error returns empty list, normal result parsing
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── inject_search_results ─────────────────────────────────────────────

class TestInjectSearchResults:
    def test_empty_results_returns_context_unchanged(self):
        """Empty results return context unchanged."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统提示"},
            {"role": "user", "content": "用户问题"},
        ]
        result = inject_search_results(context, [])
        assert result == context

    def test_inserts_after_last_system_message(self):
        """Search results are inserted after the last system message."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统一"},
            {"role": "system", "content": "系统二"},
            {"role": "user", "content": "用户问题"},
        ]
        results = [{"title": "标题", "url": "http://example.com", "content": "内容"}]
        output = inject_search_results(context, results)

        # Find where the injected message was placed
        injected_idx = next(i for i, m in enumerate(output) if "联网搜索结果" in m["content"])
        # Should be after the second system message (index 1), i.e., at index 2
        assert injected_idx == 2

    def test_inserts_at_start_when_no_system_messages(self):
        """Search results inserted at index 0 when no system messages exist."""
        from services.search_service import inject_search_results
        context = [
            {"role": "user", "content": "问题"},
            {"role": "assistant", "content": "回答"},
        ]
        results = [{"title": "标题", "url": "http://example.com", "content": "内容"}]
        output = inject_search_results(context, results)
        assert output[0]["role"] == "system"
        assert "联网搜索结果" in output[0]["content"]

    def test_content_truncated_to_300_chars(self):
        """Content longer than 300 characters is truncated."""
        from services.search_service import inject_search_results
        long_content = "X" * 500
        results = [{"title": "标题", "url": "http://example.com", "content": long_content}]
        output = inject_search_results([], results)
        injected = output[0]["content"]
        # Truncated content should be at most 300 characters
        assert "X" * 301 not in injected
        assert "X" * 300 in injected

    def test_multiple_results_all_appear(self):
        """All multiple results appear in the injected system message."""
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
        """Results with empty content still show title and URL."""
        from services.search_service import inject_search_results
        results = [{"title": "只有标题", "url": "http://example.com", "content": ""}]
        output = inject_search_results([], results)
        injected = output[0]["content"]
        assert "只有标题" in injected
        assert "http://example.com" in injected

    def test_empty_context_with_results(self):
        """Empty context with results produces a single system message."""
        from services.search_service import inject_search_results
        results = [{"title": "T", "url": "http://u.com", "content": "C"}]
        output = inject_search_results([], results)
        assert len(output) == 1
        assert output[0]["role"] == "system"

    def test_original_context_messages_preserved(self):
        """Original context messages are preserved in order after injection."""
        from services.search_service import inject_search_results
        context = [
            {"role": "system", "content": "系统提示"},
            {"role": "user", "content": "用户问题"},
            {"role": "assistant", "content": "AI 回答"},
        ]
        results = [{"title": "T", "url": "http://u.com", "content": "C"}]
        output = inject_search_results(context, results)
        # Original 3 messages + 1 injected = 4 messages total
        assert len(output) == 4
        # User and AI messages still present
        assert any(m["role"] == "user" for m in output)
        assert any(m["role"] == "assistant" for m in output)


# ── search ────────────────────────────────────────────────────────────

class TestSearch:
    @pytest.mark.asyncio
    async def test_timeout_returns_empty_list(self):
        """Returns empty list on request timeout."""
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
        """Returns empty list on HTTP error."""
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
        """Successful response is parsed into result list."""
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
        """max_results parameter limits the number of returned results."""
        from services.search_service import search

        # Generate 10 results
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
        """Results without a URL are filtered out."""
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
        """Returns empty list when response results is empty."""
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
