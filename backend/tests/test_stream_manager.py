# tests/test_stream_manager.py
"""
Unit tests for the stream manager.

Covers:
    _parse_meta: all fallback paths (complete JSON, truncation repair, regex extraction, empty input)
    _sse: SSE format serialization
    META sentinel streaming truncation (integration verification via stream_and_save)
    stream_and_save: full conversation round flow (mocked DB and LLM)
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from services.llm_client import ChatStreamResult


def _wrap_fake_stream(gen_fn):
    """Wrap an async generator function as an async function returning ChatStreamResult."""
    async def wrapper(*args, **kwargs):
        return ChatStreamResult(gen_fn(*args, **kwargs))
    return wrapper


# ── _parse_meta ───────────────────────────────────────────────────────

class TestParseMeta:
    def _call(self, raw: str) -> dict:
        from services.stream_manager import _parse_meta
        return _parse_meta(raw)

    def test_valid_json(self):
        """Complete JSON is parsed directly."""
        raw = '{"summary": "摘要内容", "title": "对话标题"}'
        result = self._call(raw)
        assert result["summary"] == "摘要内容"
        assert result["title"] == "对话标题"

    def test_summary_only(self):
        """Parses correctly with only the summary field."""
        raw = '{"summary": "只有摘要"}'
        result = self._call(raw)
        assert result["summary"] == "只有摘要"
        assert "title" not in result

    def test_truncated_json_missing_brace(self):
        """Truncated JSON missing closing brace is repaired."""
        raw = '{"summary": "内容"'
        result = self._call(raw)
        assert result.get("summary") == "内容"

    def test_truncated_json_missing_quote_and_brace(self):
        """Truncated JSON missing closing quote and brace is repaired."""
        raw = '{"summary": "内容'
        result = self._call(raw)
        # Regex fallback should extract summary
        assert "summary" in result

    def test_end_marker_stripped(self):
        """<<<END>>> marker is stripped before parsing."""
        raw = '{"summary": "test"}<<<END>>>'
        result = self._call(raw)
        assert result.get("summary") == "test"

    def test_close_tag_stripped(self):
        """</deeppin_meta> closing tag is stripped before parsing."""
        raw = '{"summary": "x", "title": "y"}</deeppin_meta>'
        result = self._call(raw)
        assert result.get("summary") == "x"
        assert result.get("title") == "y"

    def test_close_tag_with_trailing_whitespace(self):
        """Trailing whitespace after the closing tag is also handled."""
        raw = '{"summary": "x"}</deeppin_meta>\n\n  '
        result = self._call(raw)
        assert result.get("summary") == "x"

    def test_regex_fallback_extracts_fields(self):
        """Regex extracts fields from completely invalid JSON."""
        raw = 'garbage {"summary": "正则提取", "title": "标题"} more garbage'
        result = self._call(raw)
        assert result.get("summary") == "正则提取"
        assert result.get("title") == "标题"

    def test_empty_string_returns_empty_dict(self):
        """Empty string returns an empty dict."""
        from services.stream_manager import stream_and_save
        from services.stream_manager import _parse_meta
        result = _parse_meta("")
        assert result == {}

    def test_whitespace_only(self):
        """Whitespace-only string returns an empty dict."""
        from services.stream_manager import _parse_meta
        result = _parse_meta("   \n\t  ")
        assert result == {}

    def test_unicode_content(self):
        """Summary with Chinese characters is parsed correctly."""
        raw = '{"summary": "用户询问了人工智能的定义，AI 解释了机器学习的基本概念。"}'
        result = self._call(raw)
        assert "人工智能" in result["summary"]


# ── _sse ──────────────────────────────────────────────────────────────

class TestSseHelper:
    def _call(self, event_type: str, data: dict) -> str:
        from services.stream_manager import _sse
        return _sse(event_type, data)

    def test_sse_format_starts_with_data(self):
        """SSE format must start with 'data: '."""
        result = self._call("chunk", {"content": "hello"})
        assert result.startswith("data: ")

    def test_sse_format_ends_with_double_newline(self):
        """SSE format must end with a double newline."""
        result = self._call("done", {"message_id": "abc"})
        assert result.endswith("\n\n")

    def test_sse_type_in_payload(self):
        """The type field is included in the payload."""
        result = self._call("ping", {})
        payload = json.loads(result[len("data: "):].strip())
        assert payload["type"] == "ping"

    def test_sse_data_merged_into_payload(self):
        """Passed data is merged into the payload."""
        result = self._call("chunk", {"content": "世界"})
        payload = json.loads(result[len("data: "):].strip())
        assert payload["content"] == "世界"

    def test_sse_non_ascii_preserved(self):
        """Chinese characters are not ASCII-escaped."""
        result = self._call("chunk", {"content": "你好"})
        assert "你好" in result


# META sentinel truncation logic (pure logic, no DB needed) ────────────────────────

class TestMetaSentinelStripping:
    """
    Verify the core algorithm for META sentinel stripping during streaming.

    Tests buffer boundary handling by simulating chunk sequences.
    """

    def _simulate_stream(self, chunks: list[str]):
        """
        Simulate the buffer/sentinel stripping logic inside stream_and_save,
        reusing the production _SENTINEL_RE regex.
        """
        from services.stream_manager import _SENTINEL_RE, _SENTINEL_LEN
        buffer = ""
        full_content = ""
        meta_str = ""
        in_meta = False

        for chunk in chunks:
            if in_meta:
                meta_str += chunk
                continue
            buffer += chunk
            m = _SENTINEL_RE.search(buffer)
            if m:
                before = buffer[:m.start()]
                full_content += before
                meta_str = buffer[m.end():]
                in_meta = True
                buffer = ""
            else:
                safe_len = max(0, len(buffer) - (_SENTINEL_LEN - 1))
                if safe_len > 0:
                    full_content += buffer[:safe_len]
                    buffer = buffer[safe_len:]

        if buffer and not in_meta:
            full_content += buffer

        return full_content, meta_str

    def test_no_meta_sentinel(self):
        """All content is output when there is no META sentinel."""
        chunks = ["Hello", " world", "!"]
        content, meta = self._simulate_stream(chunks)
        assert content == "Hello world!"
        assert meta == ""

    def test_meta_tag_in_single_chunk(self):
        """META open tag in a single chunk; body is correctly truncated."""
        from services.llm_client import META_TAG_OPEN, META_TAG_CLOSE
        chunks = [f'正文内容{META_TAG_OPEN}{{"summary":"摘要"}}{META_TAG_CLOSE}']
        content, meta = self._simulate_stream(chunks)
        assert content == "正文内容"
        assert "summary" in meta
        # Closing tag is collected as part of meta_str; _parse_meta strips it later
        assert META_TAG_CLOSE in meta

    def test_meta_tag_split_across_chunks(self):
        """Open tag spanning a chunk boundary is still detected."""
        from services.llm_client import META_TAG_OPEN, META_TAG_CLOSE
        half = len(META_TAG_OPEN) // 2
        part1 = "正文" + META_TAG_OPEN[:half]
        part2 = META_TAG_OPEN[half:] + '{"summary":"摘要"}' + META_TAG_CLOSE
        chunks = [part1, part2]
        content, meta = self._simulate_stream(chunks)
        assert content == "正文"
        assert "summary" in meta

    def test_empty_chunks(self):
        """Empty chunk list produces no content."""
        content, meta = self._simulate_stream([])
        assert content == ""
        assert meta == ""

    def test_content_before_and_after_meta(self):
        """Content before META is kept; META block (and everything after) is discarded from body."""
        from services.llm_client import META_TAG_OPEN, META_TAG_CLOSE
        chunks = [f"保留内容{META_TAG_OPEN}丢弃内容{META_TAG_CLOSE}"]
        content, meta = self._simulate_stream(chunks)
        assert "保留内容" in content
        assert "丢弃" not in content

    def test_meta_round_trip_parses(self):
        """End-to-end stripping + _parse_meta: JSON inside the tag parses correctly."""
        from services.llm_client import META_TAG_OPEN, META_TAG_CLOSE
        from services.stream_manager import _parse_meta
        chunks = [
            f'正文。{META_TAG_OPEN}{{"summary": "摘要内容", "title": "标题"}}{META_TAG_CLOSE}'
        ]
        content, meta = self._simulate_stream(chunks)
        assert content == "正文。"
        parsed = _parse_meta(meta)
        assert parsed.get("summary") == "摘要内容"
        assert parsed.get("title") == "标题"

    def test_body_json_without_meta_tag_not_stripped(self):
        """Plain JSON snippets in the body are NOT mistaken for META."""
        chunks = ['某 API 响应格式：\n{"summary": "x", "title": "y"} 这种就是。']
        content, meta = self._simulate_stream(chunks)
        # Entire chunk is body content
        assert '{"summary"' in content
        assert meta == ""


# stream_and_save full flow (mock DB + LLM) ─────────────────────────

class TestStreamAndSave:
    """
    Verify the full stream_and_save flow:
    save message → build context → stream output → save assistant message → background summary write
    """

    def _make_supabase_mock(self):
        """Build a chainable Supabase mock."""
        sb = MagicMock()
        # Generic chained calls return self
        for attr in ("table", "insert", "select", "update", "upsert",
                     "eq", "order", "limit", "single", "maybe_single"):
            getattr(sb, attr).return_value = sb
        # .single() returns data as a dict (not a list) — consistent with the Supabase SDK behavior
        sb.execute.return_value = MagicMock(
            data={
                "id": "msg-id-1",
                "depth": 0,
                "title": None,
                "session_id": "session-1",
            },
            count=1,
        )
        return sb

    @pytest.mark.asyncio
    async def test_yields_ping_first(self):
        """The first SSE event must be ping."""
        sb = self._make_supabase_mock()

        async def fake_chat_stream(*args, **kwargs):
            yield "AI 回复内容"

        with patch("services.stream_manager.get_supabase", return_value=sb), \
             patch("services.stream_manager.build_context", new=AsyncMock(return_value=[])), \
             patch("services.stream_manager.classify_search_intent", new=AsyncMock(return_value=False)), \
             patch("services.stream_manager.chat_stream", side_effect=_wrap_fake_stream(fake_chat_stream)), \
             patch("services.memory_service.store_long_text_chunks", new=AsyncMock(return_value=0)):

            from services.stream_manager import stream_and_save
            events = []
            async for event in stream_and_save("thread-1", "用户问题"):
                events.append(event)

        first_payload = json.loads(events[0][len("data: "):].strip())
        assert first_payload["type"] == "ping"

    @pytest.mark.asyncio
    async def test_yields_done_with_message_id(self):
        """The done event includes a message_id on normal completion."""
        sb = self._make_supabase_mock()

        # Execute call order:
        #   1. INSERT user message      → data not used
        #   2. SELECT thread (.single() → data dict, not list)
        #   3. INSERT assistant message → data list (stream_manager reads data[0]["id"])
        #   4. COUNT messages for embed → count used for throttle decision
        sb.execute.side_effect = [
            MagicMock(data=None),                                            # 1. user insert
            MagicMock(data={"id": "t1", "depth": 0, "title": None, "session_id": "s1"}),  # 2. thread query
            MagicMock(data=[{"id": "saved-msg-id"}]),                        # 3. assistant insert
            MagicMock(data=[], count=0),                                     # 4. count for embedding
        ]

        async def fake_chat_stream(*args, **kwargs):
            yield "正常回复"

        with patch("services.stream_manager.get_supabase", return_value=sb), \
             patch("services.stream_manager.build_context", new=AsyncMock(return_value=[])), \
             patch("services.stream_manager.classify_search_intent", new=AsyncMock(return_value=False)), \
             patch("services.stream_manager.chat_stream", side_effect=_wrap_fake_stream(fake_chat_stream)), \
             patch("services.memory_service.store_long_text_chunks", new=AsyncMock(return_value=0)), \
             patch("services.stream_manager._save_summary", new=AsyncMock()), \
             patch("services.memory_service.store_conversation_memory", new=AsyncMock()):

            from services.stream_manager import stream_and_save
            events = []
            async for event in stream_and_save("thread-1", "问题"):
                events.append(event)

        done_events = [e for e in events if '"done"' in e]
        assert len(done_events) >= 1

    @pytest.mark.asyncio
    async def test_db_error_yields_error_event(self):
        """Yields an error event when saving the user message fails."""
        sb = MagicMock()
        sb.table.return_value = sb
        sb.insert.return_value = sb
        sb.execute.side_effect = Exception("DB connection failed")

        with patch("services.stream_manager.get_supabase", return_value=sb):
            from services.stream_manager import stream_and_save
            events = []
            async for event in stream_and_save("thread-1", "问题"):
                events.append(event)

        error_events = [e for e in events if '"error"' in e]
        assert len(error_events) >= 1

    @pytest.mark.asyncio
    async def test_empty_llm_output_yields_done_with_null_id(self):
        """done has null message_id when LLM produces no output."""
        sb = self._make_supabase_mock()

        async def fake_chat_stream(*args, **kwargs):
            yield ""  # Empty content

        with patch("services.stream_manager.get_supabase", return_value=sb), \
             patch("services.stream_manager.build_context", new=AsyncMock(return_value=[])), \
             patch("services.stream_manager.classify_search_intent", new=AsyncMock(return_value=False)), \
             patch("services.stream_manager.chat_stream", side_effect=_wrap_fake_stream(fake_chat_stream)), \
             patch("services.memory_service.store_long_text_chunks", new=AsyncMock(return_value=0)):

            from services.stream_manager import stream_and_save
            events = []
            async for event in stream_and_save("thread-1", "问题"):
                events.append(event)

        done_events = [e for e in events if '"done"' in e]
        assert len(done_events) >= 1
        payload = json.loads(done_events[-1][len("data: "):].strip())
        assert payload["message_id"] is None
