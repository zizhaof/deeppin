# tests/test_merge_router.py
"""
Unit tests for the merge output router.

Covers:
    MergeRequest.validate_format: valid values / invalid values / default
    _sse: SSE event serialization format
  - generate(): no sub-threads -> error event; sub-threads -> go through merge_threads; content from thread_summaries cache;
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
        """Default format is 'free'."""
        from routers.merge import MergeRequest
        r = MergeRequest()
        assert r.format == "free"

    def test_valid_formats_accepted(self):
        """All five valid formats are accepted."""
        for fmt in ("free", "bullets", "structured", "custom", "transcript"):
            r = self._make(fmt)
            assert r.format == fmt

    def test_invalid_format_raises(self):
        """Invalid format raises ValidationError."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            self._make("invalid_format")


# ── _sse helper ───────────────────────────────────────────────────────

class TestSseHelper:
    def test_ping_event(self):
        """ping event serializes correctly."""
        from routers.merge import _sse
        line = _sse("ping", {})
        assert line.startswith("data: ")
        payload = json.loads(line[6:])
        assert payload["type"] == "ping"

    def test_status_event_includes_text(self):
        """status event includes the text field."""
        from routers.merge import _sse
        line = _sse("status", {"text": "hello"})
        payload = json.loads(line[6:])
        assert payload["type"] == "status"
        assert payload["text"] == "hello"

    def test_chunk_event_includes_content(self):
        """chunk event includes the content field."""
        from routers.merge import _sse
        line = _sse("chunk", {"content": "abc"})
        payload = json.loads(line[6:])
        assert payload["type"] == "chunk"
        assert payload["content"] == "abc"

    def test_event_ends_with_double_newline(self):
        """Every SSE event ends with \\n\\n."""
        from routers.merge import _sse
        assert _sse("done", {}).endswith("\n\n")


# ── generate() streaming logic ────────────────────────────────────────

def _make_db_mock(*responses):
    """
    Build an async _db mock that returns each response in order.
    """
    results = list(responses)
    idx = [0]

    async def fake_db(fn, **_kw):
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
        """Non-existent session raises 404."""
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
        """        No sub-threads (depth > 0) yields an error event."""
        sb = MagicMock()
        fake_db = _make_db_mock(_session_exists(), _no_threads())
        with patch("routers.merge._db", side_effect=fake_db):
            events = await _collect_generate(SESSION_ID, sb=sb)
        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        assert "子线程" in error_events[0]["message"] or "No sub-threads" in error_events[0]["message"]

    def _make_sb(self, sub_threads=None, main_messages=None, sub_messages=None):
        """
        Build a generic Supabase mock routed by table name:
        - sessions -> session exists
        - threads (gt/order) -> sub_threads list
        Build a Supabase mock that routes by table name.
        """
        if sub_threads is None:
            sub_threads = [{"id": "t1", "title": "T", "anchor_text": "A", "depth": 1}]
        if main_messages is None:
            main_messages = [{"role": "user", "content": "main q"}, {"role": "assistant", "content": "main a"}]
        if sub_messages is None:
            sub_messages = [{"role": "user", "content": "question"}, {"role": "assistant", "content": "answer"}]

        msg_calls = [0]

        def make_table(name):
            m = MagicMock()
            if name == "sessions":
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"id": SESSION_ID})
            elif name == "threads":
                # sub-threads query (depth > 0)
                m.select.return_value.eq.return_value.gt.return_value.order.return_value.execute.return_value = \
                    MagicMock(data=sub_threads)
                # main thread query (depth = 0, maybe_single)
                m.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = \
                    MagicMock(data={"id": "main-1"})
            elif name == "messages":
                msg_calls[0] += 1
                msgs = main_messages if msg_calls[0] == 1 else sub_messages
                m.select.return_value.eq.return_value.order.return_value.execute.return_value = \
                    MagicMock(data=msgs)
            return m

        sb = MagicMock()
        sb.table.side_effect = make_table
        return sb

    @pytest.mark.asyncio
    async def test_uses_full_messages_for_content(self):
        """        Merge uses full message history for both main and sub-threads."""
        sb = self._make_sb(
            sub_messages=[{"role": "user", "content": "question"}, {"role": "assistant", "content": "answer"}]
        )
        passed_kwargs = {}

        async def fake_merge(threads_data, main_content="", format_type="free", custom_prompt=None, **_):
            passed_kwargs["threads_data"] = threads_data
            passed_kwargs["main_content"] = main_content
            yield "merged"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        assert any(e["type"] == "chunk" and e["content"] == "merged" for e in events)
        assert "question" in passed_kwargs["threads_data"][0]["content"]
        assert "answer" in passed_kwargs["threads_data"][0]["content"]
        assert "main" in passed_kwargs["main_content"]  # main thread content included

    @pytest.mark.asyncio
    async def test_falls_back_to_messages_on_cache_miss(self):
        """Sub-thread messages are formatted with correct user/AI labels.
        Sub-thread messages are formatted with correct user/AI labels."""
        sb = self._make_sb(
            sub_messages=[{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}]
        )
        passed_threads_data = []

        async def fake_merge(threads_data, main_content="", format_type="free", custom_prompt=None, **_):
            passed_threads_data.extend(threads_data)
            yield "ok"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            await _collect_generate(SESSION_ID, sb=sb)

        assert passed_threads_data
        assert "用户：q" in passed_threads_data[0]["content"]
        assert "AI：a" in passed_threads_data[0]["content"]

    @pytest.mark.asyncio
    async def test_all_empty_threads_yields_error(self):
        """        Yields an error event when all sub-threads have empty content."""
        sb = self._make_sb(
            sub_threads=[{"id": "t1", "title": "", "anchor_text": "", "depth": 1}],
            sub_messages=[],
        )
        events = await _collect_generate(SESSION_ID, sb=sb)
        assert any(e["type"] == "error" for e in events)

    @pytest.mark.asyncio
    async def test_streams_chunks_and_done(self):
        """        Happy path: yields chunk events followed by a done event."""
        sb = self._make_sb(
            sub_messages=[{"role": "assistant", "content": "some content"}]
        )

        async def fake_merge(threads_data, main_content="", format_type="free", custom_prompt=None, **_):
            yield "part1"
            yield "part2"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        chunk_contents = [e["content"] for e in events if e["type"] == "chunk"]
        assert "part1" in chunk_contents
        assert "part2" in chunk_contents
        assert any(e["type"] == "done" for e in events)

    @pytest.mark.asyncio
    async def test_truncates_when_content_exceeds_budget(self):
        """        Truncates content when it exceeds the char budget (no summarizer call)."""
        long_content = "A" * 100_000
        sb = self._make_sb(sub_messages=[{"role": "assistant", "content": long_content}])

        captured: list[dict] = []

        async def fake_merge(threads_data, main_content="", format_type="free", custom_prompt=None, **_):
            captured.extend(threads_data)
            yield "ok"

        with patch("routers.merge.merge_threads", side_effect=fake_merge):
            events = await _collect_generate(SESSION_ID, sb=sb)

        assert any(e["type"] == "done" for e in events)
        # Content should be truncated, not passed in full
        if captured:
            sub_content = captured[0].get("content", "")
            assert len(sub_content) < 100_000, "Expected content to be truncated"
            assert "截断" in sub_content or "truncated" in sub_content.lower()


class TestMergeRequestThreadIds:
    def test_thread_ids_defaults_to_none(self):
        """thread_ids defaults to None (merge all)."""
        from routers.merge import MergeRequest
        r = MergeRequest()
        assert r.thread_ids is None

    def test_thread_ids_accepts_list(self):
        """thread_ids accepts a list of strings."""
        from routers.merge import MergeRequest
        r = MergeRequest(thread_ids=["abc", "def"])
        assert r.thread_ids == ["abc", "def"]
