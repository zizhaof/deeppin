# tests/test_merge_router.py
"""
合并输出路由单元测试
Unit tests for the merge output router.

覆盖 / Covers:
  - MergeRequest.validate_format：合法值 / 非法值 / 默认值
    MergeRequest.validate_format: valid values / invalid values / default
  - _sse：SSE 事件序列化格式
    _sse: SSE event serialization format
  - generate()：无子线程 → error 事件；有子线程 → 走 merge_threads；content 来自 thread_summaries 缓存；
                 缓存缺失时降级为消息拼接；子线程全空 → error 事件
    generate(): no sub-threads → error event; sub-threads present → calls merge_threads;
                content from thread_summaries cache; cache miss falls back to message concat;
                all threads empty → error event
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── MergeRequest validation ───────────────────────────────────────────

class TestMergeRequestValidation:
    def _make(self, format_value):
        from routers.merge import MergeRequest
        return MergeRequest(format=format_value)

    def test_default_format_is_free(self):
        """默认 format 为 free / Default format is 'free'."""
        from routers.merge import MergeRequest
        r = MergeRequest()
        assert r.format == "free"

    def test_valid_formats_accepted(self):
        """三种合法格式均被接受 / All three valid formats are accepted."""
        for fmt in ("free", "bullets", "structured"):
            r = self._make(fmt)
            assert r.format == fmt

    def test_invalid_format_raises(self):
        """非法格式触发 ValidationError / Invalid format raises ValidationError."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            self._make("invalid_format")


# ── _sse helper ───────────────────────────────────────────────────────

class TestSseHelper:
    def test_ping_event(self):
        """ping 事件序列化正确 / ping event serializes correctly."""
        from routers.merge import _sse
        line = _sse("ping", {})
        assert line.startswith("data: ")
        payload = json.loads(line[6:])
        assert payload["type"] == "ping"

    def test_status_event_includes_text(self):
        """status 事件包含 text 字段 / status event includes the text field."""
        from routers.merge import _sse
        line = _sse("status", {"text": "hello"})
        payload = json.loads(line[6:])
        assert payload["type"] == "status"
        assert payload["text"] == "hello"

    def test_chunk_event_includes_content(self):
        """chunk 事件包含 content 字段 / chunk event includes the content field."""
        from routers.merge import _sse
        line = _sse("chunk", {"content": "abc"})
        payload = json.loads(line[6:])
        assert payload["type"] == "chunk"
        assert payload["content"] == "abc"

    def test_event_ends_with_double_newline(self):
        """每个 SSE 事件以 \\n\\n 结尾 / Every SSE event ends with \\n\\n."""
        from routers.merge import _sse
        assert _sse("done", {}).endswith("\n\n")


# ── generate() streaming logic ────────────────────────────────────────

def _make_db_mock(*responses):
    """
    构造按调用顺序依次返回值的 _db mock（async）。
    Build an async _db mock that returns each response in order.
    """
    results = list(responses)
    idx = [0]

    async def fake_db(fn):
        r = results[idx[0]] if idx[0] < len(results) else MagicMock(data=None)
        idx[0] += 1
        return r

    return fake_db


def _session_exists():
    return MagicMock(data={"id": "sess-1"})


def _no_threads():
    return MagicMock(data=[])


def _threads(*ids):
    return MagicMock(data=[
        {"id": tid, "title": f"Thread {i}", "anchor_text": f"anchor {i}", "depth": 1}
        for i, tid in enumerate(ids, 1)
    ])


def _summary(text):
    return MagicMock(data={"summary": text})


def _no_summary():
    return MagicMock(data=None)


def _messages(*pairs):
    """pairs: list of (role, content)"""
    return MagicMock(data=[{"role": r, "content": c} for r, c in pairs])


async def _collect_generate(session_id, format_type="free", sb=None):
    """Run generate() and collect all SSE lines."""
    import uuid
    from routers.merge import merge as merge_endpoint, MergeRequest
    if sb is None:
        sb = MagicMock()
    mock_auth = ("mock-user-id", sb)
    resp = await merge_endpoint(uuid.UUID(session_id), MergeRequest(format=format_type), auth=mock_auth)
    events = []
    async for chunk in resp.body_iterator:
        if isinstance(chunk, bytes):
            chunk = chunk.decode()
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


SESSION_ID = "00000000-0000-0000-0000-000000000001"


class TestMergeGenerate:
    @pytest.mark.asyncio
    async def test_session_not_found_raises_404(self):
        """session 不存在返回 404 / Non-existent session raises 404."""
        from fastapi import HTTPException
        from routers.merge import merge as merge_endpoint, MergeRequest
        import uuid

        sb = MagicMock()
        fake_db = _make_db_mock(MagicMock(data=None))
        mock_auth = ("mock-user-id", sb)
        with patch("routers.merge._db", side_effect=fake_db):
            with pytest.raises(HTTPException) as exc_info:
                await merge_endpoint(uuid.UUID(SESSION_ID), MergeRequest(), auth=mock_auth)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_no_sub_threads_yields_error_event(self):
        """没有子线程（depth > 0）时产生 error 事件
        No sub-threads (depth > 0) yields an error event."""
        sb = MagicMock()
        fake_db = _make_db_mock(_session_exists(), _no_threads())
        with patch("routers.merge._db", side_effect=fake_db):
            events = await _collect_generate(SESSION_ID, sb=sb)
        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        assert "子线程" in error_events[0]["message"] or "No sub-threads" in error_events[0]["message"]

    @pytest.mark.asyncio
    async def test_uses_summary_cache_when_available(self):
        """有缓存摘要时使用摘要而不查消息
        Uses the cached summary instead of querying messages."""
        db_calls = []

        async def tracking_db(fn):
            result = fn()
            db_calls.append(result)
            return result

        sb = MagicMock()
        # session exists
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
            MagicMock(data={"id": SESSION_ID})
        # threads query
        sb.table.return_value.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value = \
            MagicMock(data=[{"id": "t1", "title": "Thread 1", "anchor_text": "anchor", "depth": 1}])
        # summary hit
        sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
            MagicMock(data={"summary": "cached summary text"})

        async def fake_merge(threads_data, format_type="free", custom_prompt=None):
            yield "merged"

        with patch("routers.merge._db", side_effect=tracking_db), \
             patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        chunk_events = [e for e in events if e["type"] == "chunk"]
        assert any(e["content"] == "merged" for e in chunk_events)
        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1

    @pytest.mark.asyncio
    async def test_falls_back_to_messages_on_cache_miss(self):
        """缓存缺失时回退到读取最近消息
        Falls back to reading recent messages when the summary cache is missing."""
        sb = MagicMock()

        call_count = [0]

        def make_table(table_name):
            m = MagicMock()
            call_count[0] += 1
            n = call_count[0]
            if n == 1:
                # session exists
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"id": SESSION_ID})
            elif n == 2:
                # threads
                m.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value = \
                    MagicMock(data=[{"id": "t1", "title": "T", "anchor_text": "A", "depth": 1}])
            elif n == 3:
                # summary miss
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data=None)
            else:
                # messages fallback
                m.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = \
                    MagicMock(data=[{"role": "user", "content": "question"}, {"role": "assistant", "content": "answer"}])
            return m

        sb.table.side_effect = make_table

        passed_threads_data = []

        async def fake_merge(threads_data, format_type="free", custom_prompt=None):
            passed_threads_data.extend(threads_data)
            yield "ok"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        # content should contain the concatenated messages
        assert passed_threads_data
        assert "question" in passed_threads_data[0]["content"] or "answer" in passed_threads_data[0]["content"]

    @pytest.mark.asyncio
    async def test_all_empty_threads_yields_error(self):
        """所有子线程内容为空时产生 error 事件
        Yields an error event when all sub-threads have empty content."""
        sb = MagicMock()
        call_count = [0]

        def make_table(_name):
            m = MagicMock()
            call_count[0] += 1
            n = call_count[0]
            if n == 1:
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"id": SESSION_ID})
            elif n == 2:
                m.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value = \
                    MagicMock(data=[{"id": "t1", "title": "", "anchor_text": "", "depth": 1}])
            elif n == 3:
                # no summary
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data=None)
            else:
                # empty messages
                m.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = \
                    MagicMock(data=[])
            return m

        sb.table.side_effect = make_table

        events = await _collect_generate(SESSION_ID, sb=sb)

        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1

    @pytest.mark.asyncio
    async def test_streams_chunks_and_done(self):
        """正常路径：产生 chunk 事件 + done 事件
        Happy path: yields chunk events followed by a done event."""
        sb = MagicMock()
        call_count = [0]

        def make_table(_name):
            m = MagicMock()
            call_count[0] += 1
            n = call_count[0]
            if n == 1:
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"id": SESSION_ID})
            elif n == 2:
                m.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value = \
                    MagicMock(data=[{"id": "t1", "title": "T", "anchor_text": "A", "depth": 1}])
            else:
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"summary": "some content"})
            return m

        sb.table.side_effect = make_table

        async def fake_merge(threads_data, format_type="free", custom_prompt=None):
            yield "part1"
            yield "part2"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        chunk_contents = [e["content"] for e in events if e["type"] == "chunk"]
        assert "part1" in chunk_contents
        assert "part2" in chunk_contents
        assert any(e["type"] == "done" for e in events)


class TestMergeRequestThreadIds:
    def test_thread_ids_defaults_to_none(self):
        """thread_ids 默认为 None（合并全部）/ thread_ids defaults to None (merge all)."""
        from routers.merge import MergeRequest
        r = MergeRequest()
        assert r.thread_ids is None

    def test_thread_ids_accepts_list(self):
        """thread_ids 接受字符串列表 / thread_ids accepts a list of strings."""
        from routers.merge import MergeRequest
        r = MergeRequest(thread_ids=["abc", "def"])
        assert r.thread_ids == ["abc", "def"]
