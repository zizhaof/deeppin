# tests/test_stream_manager.py
"""
Stream Manager 单元测试
Unit tests for the stream manager.

覆盖 / Covers:
  - _parse_meta：全部 fallback 路径（完整 JSON、截断修复、正则提取、空输入）
    _parse_meta: all fallback paths (complete JSON, truncation repair, regex extraction, empty input)
  - _sse：SSE 格式序列化
    _sse: SSE format serialization
  - META sentinel 流式截断逻辑（通过 stream_and_save 的集成验证）
    META sentinel streaming truncation (integration verification via stream_and_save)
  - stream_and_save：完整一轮对话流程（mock DB 和 LLM）
    stream_and_save: full conversation round flow (mocked DB and LLM)
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from services.llm_client import ChatStreamResult


def _wrap_fake_stream(gen_fn):
    """将 async generator 函数包装为返回 ChatStreamResult 的 async function。"""
    async def wrapper(*args, **kwargs):
        return ChatStreamResult(gen_fn(*args, **kwargs))
    return wrapper


# ── _parse_meta ───────────────────────────────────────────────────────

class TestParseMeta:
    def _call(self, raw: str) -> dict:
        from services.stream_manager import _parse_meta
        return _parse_meta(raw)

    def test_valid_json(self):
        """完整 JSON 直接解析 / Complete JSON is parsed directly."""
        raw = '{"summary": "摘要内容", "title": "对话标题"}'
        result = self._call(raw)
        assert result["summary"] == "摘要内容"
        assert result["title"] == "对话标题"

    def test_summary_only(self):
        """只有 summary 字段也能解析 / Parses correctly with only the summary field."""
        raw = '{"summary": "只有摘要"}'
        result = self._call(raw)
        assert result["summary"] == "只有摘要"
        assert "title" not in result

    def test_truncated_json_missing_brace(self):
        """截断 JSON 缺少结尾 '}'，补全后能解析 / Truncated JSON missing closing brace is repaired."""
        raw = '{"summary": "内容"'
        result = self._call(raw)
        assert result.get("summary") == "内容"

    def test_truncated_json_missing_quote_and_brace(self):
        """截断 JSON 缺少结尾引号和括号，补全后能解析 / Truncated JSON missing closing quote and brace is repaired."""
        raw = '{"summary": "内容'
        result = self._call(raw)
        # 正则 fallback 应能提取 summary
        # Regex fallback should extract summary
        assert "summary" in result

    def test_end_marker_stripped(self):
        """<<<END>>> 标记在解析前被去掉 / <<<END>>> marker is stripped before parsing."""
        raw = '{"summary": "test"}<<<END>>>'
        result = self._call(raw)
        assert result.get("summary") == "test"

    def test_regex_fallback_extracts_fields(self):
        """完全无效的 JSON 时正则提取字段 / Regex extracts fields from completely invalid JSON."""
        raw = 'garbage {"summary": "正则提取", "title": "标题"} more garbage'
        result = self._call(raw)
        assert result.get("summary") == "正则提取"
        assert result.get("title") == "标题"

    def test_empty_string_returns_empty_dict(self):
        """空字符串返回空 dict / Empty string returns an empty dict."""
        from services.stream_manager import stream_and_save
        from services.stream_manager import _parse_meta
        result = _parse_meta("")
        assert result == {}

    def test_whitespace_only(self):
        """纯空白字符串返回空 dict / Whitespace-only string returns an empty dict."""
        from services.stream_manager import _parse_meta
        result = _parse_meta("   \n\t  ")
        assert result == {}

    def test_unicode_content(self):
        """包含中文的摘要正确解析 / Summary with Chinese characters is parsed correctly."""
        raw = '{"summary": "用户询问了人工智能的定义，AI 解释了机器学习的基本概念。"}'
        result = self._call(raw)
        assert "人工智能" in result["summary"]


# ── _sse ──────────────────────────────────────────────────────────────

class TestSseHelper:
    def _call(self, event_type: str, data: dict) -> str:
        from services.stream_manager import _sse
        return _sse(event_type, data)

    def test_sse_format_starts_with_data(self):
        """SSE 格式必须以 'data: ' 开头 / SSE format must start with 'data: '."""
        result = self._call("chunk", {"content": "hello"})
        assert result.startswith("data: ")

    def test_sse_format_ends_with_double_newline(self):
        """SSE 格式必须以双换行结尾 / SSE format must end with a double newline."""
        result = self._call("done", {"message_id": "abc"})
        assert result.endswith("\n\n")

    def test_sse_type_in_payload(self):
        """type 字段包含在 payload 中 / The type field is included in the payload."""
        result = self._call("ping", {})
        payload = json.loads(result[len("data: "):].strip())
        assert payload["type"] == "ping"

    def test_sse_data_merged_into_payload(self):
        """传入的 data 合并到 payload / Passed data is merged into the payload."""
        result = self._call("chunk", {"content": "世界"})
        payload = json.loads(result[len("data: "):].strip())
        assert payload["content"] == "世界"

    def test_sse_non_ascii_preserved(self):
        """中文字符不转义 / Chinese characters are not ASCII-escaped."""
        result = self._call("chunk", {"content": "你好"})
        assert "你好" in result


# ── META sentinel 截断逻辑（纯逻辑，不需要 DB）────────────────────────

class TestMetaSentinelStripping:
    """
    验证流式生成中 META sentinel 截断逻辑的核心算法。
    Verify the core algorithm for META sentinel stripping during streaming.

    通过模拟 chunk 序列来测试 buffer 边界处理。
    Tests buffer boundary handling by simulating chunk sequences.
    """

    def _simulate_stream(self, chunks: list[str]):
        """
        模拟 stream_and_save 内部的 buffer/sentinel 截断逻辑。
        Simulate the buffer/sentinel stripping logic inside stream_and_save.
        """
        from services.llm_client import META_SENTINEL
        sentinel_len = len(META_SENTINEL)
        buffer = ""
        full_content = ""
        meta_str = ""
        in_meta = False

        for chunk in chunks:
            if in_meta:
                meta_str += chunk
                continue
            buffer += chunk
            idx = buffer.find(META_SENTINEL)
            if idx != -1:
                before = buffer[:idx]
                full_content += before
                meta_str = buffer[idx + sentinel_len:]
                in_meta = True
                buffer = ""
            else:
                safe_len = max(0, len(buffer) - (sentinel_len - 1))
                if safe_len > 0:
                    full_content += buffer[:safe_len]
                    buffer = buffer[safe_len:]

        if buffer and not in_meta:
            full_content += buffer

        return full_content, meta_str

    def test_no_meta_sentinel(self):
        """无 META sentinel 时全部内容输出 / All content is output when there is no META sentinel."""
        chunks = ["Hello", " world", "!"]
        content, meta = self._simulate_stream(chunks)
        assert content == "Hello world!"
        assert meta == ""

    def test_meta_sentinel_in_single_chunk(self):
        """META sentinel 在单个 chunk 中出现，正文截断正确 / META sentinel in a single chunk; body is correctly truncated."""
        from services.llm_client import META_SENTINEL
        chunks = [f"正文内容{META_SENTINEL}{{\"summary\":\"摘要\"}}"]
        content, meta = self._simulate_stream(chunks)
        assert content == "正文内容"
        assert "summary" in meta

    def test_meta_sentinel_split_across_chunks(self):
        """META sentinel 跨 chunk 边界时也能被检测到 / META sentinel spanning a chunk boundary is still detected."""
        from services.llm_client import META_SENTINEL
        # 将 sentinel 拆成两半
        # Split the sentinel in half
        half = len(META_SENTINEL) // 2
        part1 = "正文" + META_SENTINEL[:half]
        part2 = META_SENTINEL[half:] + '{"summary":"摘要"}'
        chunks = [part1, part2]
        content, meta = self._simulate_stream(chunks)
        assert content == "正文"
        assert "summary" in meta

    def test_empty_chunks(self):
        """空 chunk 列表不产生任何内容 / Empty chunk list produces no content."""
        content, meta = self._simulate_stream([])
        assert content == ""
        assert meta == ""

    def test_content_before_and_after_meta(self):
        """META 之前的内容保留，之后的内容丢弃 / Content before META is kept; content after is discarded."""
        from services.llm_client import META_SENTINEL
        chunks = [f"保留内容{META_SENTINEL}丢弃内容"]
        content, meta = self._simulate_stream(chunks)
        assert "保留内容" in content
        assert "丢弃" not in content


# ── stream_and_save 完整流程（mock DB + LLM）─────────────────────────

class TestStreamAndSave:
    """
    验证 stream_and_save 完整一轮流程：
    保存消息 → 构建 context → 流式输出 → 保存 assistant 消息 → 后台写摘要
    Verify the full stream_and_save flow:
    save message → build context → stream output → save assistant message → background summary write
    """

    def _make_supabase_mock(self):
        """构造一个可链式调用的 Supabase mock / Build a chainable Supabase mock."""
        sb = MagicMock()
        # 通用链式调用返回自身
        for attr in ("table", "insert", "select", "update", "upsert",
                     "eq", "order", "limit", "single", "maybe_single"):
            getattr(sb, attr).return_value = sb
        # .single() 返回的 data 是 dict（非 list）——与 Supabase SDK 行为一致
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
        """第一个 SSE 事件必须是 ping / The first SSE event must be ping."""
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
        """正常流程结束时 done 事件包含 message_id / The done event includes a message_id on normal completion."""
        sb = self._make_supabase_mock()

        # execute 调用顺序：
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
        """保存用户消息失败时 yield error 事件 / Yields an error event when saving the user message fails."""
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
        """LLM 未输出任何内容时 done 的 message_id 为 null / done has null message_id when LLM produces no output."""
        sb = self._make_supabase_mock()

        async def fake_chat_stream(*args, **kwargs):
            yield ""  # 空内容

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
