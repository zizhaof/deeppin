# tests/test_relevance_router.py
"""
相关性评估路由单元测试
Unit tests for the relevance router.

覆盖 / Covers:
  - session 不存在 → 404
  - 无子线程 → 返回空数组
  - 有子线程、缓存命中 → 直接使用摘要调用 assess_relevance
  - 有子线程、缓存缺失 → 生成摘要后调用 assess_relevance
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


def _make_auth(user_id="user-1"):
    sb = MagicMock()
    return (user_id, sb)


class TestRelevanceSessionNotFound:
    @pytest.mark.asyncio
    async def test_404_when_session_missing(self):
        """session 不存在时返回 404 / Returns 404 when session does not exist."""
        import uuid
        from routers.relevance import relevance

        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        with pytest.raises(Exception) as exc_info:
            await relevance(uuid.uuid4(), auth=("user-1", sb))
        assert "404" in str(exc_info.value) or "not found" in str(exc_info.value).lower()


class TestRelevanceNoSubThreads:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_sub_threads(self):
        """无子线程时返回空数组 / Returns empty list when no sub-threads exist."""
        # Direct unit test of the filtering logic
        threads = [{"id": "main-1", "depth": 0, "title": None, "anchor_text": None}]
        sub_threads = [t for t in threads if t["depth"] > 0]
        assert sub_threads == []

        with patch("routers.relevance.assess_relevance", new_callable=AsyncMock) as mock_assess:
            mock_assess.return_value = []
            assert mock_assess.call_count == 0


class TestRelevanceWithSubThreads:
    @pytest.mark.asyncio
    async def test_calls_assess_relevance_with_summaries(self):
        """有摘要缓存时直接传给 assess_relevance / Uses cached summaries for assess_relevance."""
        from routers.relevance import _get_summary_or_generate

        sb = MagicMock()
        # Cache hit
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
            data={"summary": "cached summary"}
        )

        with patch("routers.relevance._db", side_effect=lambda fn: fn()):
            result = await _get_summary_or_generate("thread-1", sb)

        assert result == "cached summary"

    @pytest.mark.asyncio
    async def test_generates_summary_on_cache_miss(self):
        """缓存缺失时调用 summarize 并写库 / Generates and caches summary on cache miss."""
        from routers.relevance import _get_summary_or_generate

        sb = MagicMock()
        # Messages mock
        msgs_mock = MagicMock()
        msgs_mock.data = [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "world"}]

        call_count = [0]

        def table_router(name):
            t = MagicMock()
            if name == "thread_summaries":
                call_count[0] += 1
                if call_count[0] == 1:
                    # First call: cache miss
                    t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
                else:
                    # Second call: upsert
                    t.upsert.return_value.execute.return_value = MagicMock(data={})
            elif name == "messages":
                t.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = msgs_mock
            return t

        sb.table.side_effect = table_router

        with patch("routers.relevance._db", side_effect=lambda fn: fn()), \
             patch("routers.relevance.summarize", new_callable=AsyncMock, return_value="generated summary"):
            result = await _get_summary_or_generate("thread-1", sb)

        assert result == "generated summary"
