# tests/test_context_builder.py
"""
Context Builder 单元测试
Unit tests for the context builder.

覆盖 / Covers:
  - _budget_for_depth：各深度的 token 预算
    _budget_for_depth: token budget for each depth level
  - _messages_to_text：消息列表转纯文本
    _messages_to_text: message list to plain text conversion
  - _content_chars：消息字符数估算（str + block list 格式）
    _content_chars: character count estimation (str + block list formats)
  - _truncate_str：字符串截断
    _truncate_str: string truncation
  - _trim_context：两阶段截断（超长消息占位 + 总量超限删除）
    _trim_context: two-phase truncation (oversized message placeholder + total overflow removal)
  - build_context：主线 vs 子线程路径（mock DB）
    build_context: main thread vs sub-thread path (mocked DB)
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── _budget_for_depth ─────────────────────────────────────────────────

class TestBudgetForDepth:
    def test_depth_0_is_800(self):
        from services.context_builder import _budget_for_depth
        assert _budget_for_depth(0) == 800

    def test_depth_1_is_500(self):
        from services.context_builder import _budget_for_depth
        assert _budget_for_depth(1) == 500

    def test_depth_2_is_300(self):
        from services.context_builder import _budget_for_depth
        assert _budget_for_depth(2) == 300

    def test_depth_3_is_150(self):
        from services.context_builder import _budget_for_depth
        assert _budget_for_depth(3) == 150

    def test_depth_beyond_max_clamps_to_150(self):
        """深度超过数组长度时固定为 150 / Depth beyond array length clamps to 150."""
        from services.context_builder import _budget_for_depth
        assert _budget_for_depth(10) == 150
        assert _budget_for_depth(100) == 150


# ── _messages_to_text ─────────────────────────────────────────────────

class TestMessagesToText:
    def test_empty_list(self):
        from services.context_builder import _messages_to_text
        assert _messages_to_text([]) == ""

    def test_single_user_message(self):
        from services.context_builder import _messages_to_text
        messages = [{"role": "user", "content": "你好"}]
        text = _messages_to_text(messages)
        assert "用户：你好" in text

    def test_assistant_message_labeled_as_ai(self):
        from services.context_builder import _messages_to_text
        messages = [{"role": "assistant", "content": "你好，有什么可以帮你？"}]
        text = _messages_to_text(messages)
        assert "AI：" in text

    def test_alternating_messages_preserve_order(self):
        from services.context_builder import _messages_to_text
        messages = [
            {"role": "user", "content": "第一条"},
            {"role": "assistant", "content": "回复"},
            {"role": "user", "content": "第二条"},
        ]
        text = _messages_to_text(messages)
        lines = text.split("\n")
        assert len(lines) == 3
        assert lines[0].startswith("用户：第一条")
        assert lines[1].startswith("AI：回复")
        assert lines[2].startswith("用户：第二条")


# ── _content_chars ────────────────────────────────────────────────────

class TestContentChars:
    def test_str_content(self):
        from services.context_builder import _content_chars
        msg = {"role": "user", "content": "12345"}
        assert _content_chars(msg) == 5

    def test_list_content_sums_text_blocks(self):
        """block list 格式时累加所有 text 块的字符数 / Sums character counts across all text blocks in block list format."""
        from services.context_builder import _content_chars
        msg = {"role": "user", "content": [
            {"type": "text", "text": "abc"},
            {"type": "text", "text": "de"},
        ]}
        assert _content_chars(msg) == 5

    def test_list_content_ignores_non_text_blocks(self):
        """非 text 块不计入字符数 / Non-text blocks are not counted."""
        from services.context_builder import _content_chars
        msg = {"role": "user", "content": [
            {"type": "image_url", "image_url": "..."},
            {"type": "text", "text": "hello"},
        ]}
        assert _content_chars(msg) == 5

    def test_missing_content_returns_zero(self):
        from services.context_builder import _content_chars
        assert _content_chars({"role": "user"}) == 0

    def test_empty_string_content(self):
        from services.context_builder import _content_chars
        assert _content_chars({"role": "user", "content": ""}) == 0


# ── _truncate_str ─────────────────────────────────────────────────────

class TestTruncateStr:
    def test_under_limit_unchanged(self):
        from services.context_builder import _truncate_str
        text = "短文本"
        assert _truncate_str(text, 100) == text

    def test_at_limit_unchanged(self):
        from services.context_builder import _truncate_str
        text = "a" * 100
        assert _truncate_str(text, 100) == text

    def test_over_limit_truncated(self):
        from services.context_builder import _truncate_str
        text = "a" * 200
        result = _truncate_str(text, 100)
        assert len(result) > 100  # 包含省略提示 / Includes ellipsis note
        assert result.startswith("a" * 100)
        assert "截断" in result or "truncated" in result.lower()


# ── _trim_context ─────────────────────────────────────────────────────

class TestTrimContext:
    def test_normal_messages_unchanged(self):
        """正常长度的消息不做任何修改 / Normal-length messages are not modified."""
        from services.context_builder import _trim_context
        messages = [
            {"role": "user", "content": "短消息"},
            {"role": "assistant", "content": "短回复"},
        ]
        result = _trim_context(messages)
        assert result == messages

    def test_phase1_oversized_user_message_becomes_placeholder(self):
        """超过 _MAX_SINGLE_MSG_CHARS 的 user 消息替换为占位符 / User messages exceeding _MAX_SINGLE_MSG_CHARS become placeholders."""
        from services.context_builder import _trim_context, _MAX_SINGLE_MSG_CHARS
        long_content = "x" * (_MAX_SINGLE_MSG_CHARS + 100)
        messages = [{"role": "user", "content": long_content}]
        result = _trim_context(messages)
        assert len(result) == 1
        # 内容应该变成占位符
        # Content should become a placeholder
        assert result[0]["content"] != long_content
        assert "长文本" in result[0]["content"] or "向量" in result[0]["content"]

    def test_phase1_system_messages_never_replaced(self):
        """system 消息无论多长都不替换 / System messages are never replaced regardless of length."""
        from services.context_builder import _trim_context, _MAX_SINGLE_MSG_CHARS
        long_system = "s" * (_MAX_SINGLE_MSG_CHARS + 100)
        messages = [
            {"role": "system", "content": long_system},
            {"role": "user", "content": "短问题"},
        ]
        result = _trim_context(messages)
        assert result[0]["content"] == long_system  # system 不变 / system unchanged

    def test_phase2_drops_oldest_user_message_when_over_limit(self):
        """总量超限时从最早的 user/assistant 消息开始删除 / Drops the oldest user/assistant messages first when total exceeds the limit."""
        from services.context_builder import _trim_context, _MAX_CONTEXT_CHARS
        # 制造足够多的消息使总量超限
        # Generate enough messages to exceed the total limit
        chunk_size = _MAX_CONTEXT_CHARS // 3
        messages = [
            {"role": "user", "content": "A" * chunk_size},
            {"role": "assistant", "content": "B" * chunk_size},
            {"role": "user", "content": "C" * chunk_size},
            {"role": "assistant", "content": "D" * chunk_size},
        ]
        result = _trim_context(messages)
        # 截断后总字符数应不超过限制
        # Total characters after truncation should be within the limit
        from services.context_builder import _content_chars
        total = sum(_content_chars(m) for m in result)
        assert total <= _MAX_CONTEXT_CHARS

    def test_phase2_system_messages_never_deleted(self):
        """总量超限时 system 消息不被删除 / System messages are never deleted even when total exceeds the limit."""
        from services.context_builder import _trim_context, _MAX_CONTEXT_CHARS
        chunk_size = _MAX_CONTEXT_CHARS // 2
        messages = [
            {"role": "system", "content": "重要摘要" * 10},  # 短 system 消息 / Short system message
            {"role": "user", "content": "X" * chunk_size},
            {"role": "assistant", "content": "Y" * chunk_size},
        ]
        result = _trim_context(messages)
        # system 消息必须保留
        # System message must be retained
        assert any(m["role"] == "system" for m in result)


# ── build_context（主线 vs 子线程，mock DB）────────────────────────────

class TestBuildContext:
    def _make_supabase_mock(self, thread_data: dict, messages_data: list,
                             total_count: int = 0) -> MagicMock:
        """构造带有预设返回值的 Supabase mock / Build a Supabase mock with preset return values."""
        sb = MagicMock()
        for attr in ("table", "select", "eq", "order", "limit",
                     "single", "maybe_single", "insert", "upsert"):
            getattr(sb, attr).return_value = sb

        call_count = [0]
        def execute_side_effect():
            call_count[0] += 1
            if call_count[0] == 1:
                # 第一次：查线程 / First call: fetch thread
                return MagicMock(data=thread_data)
            elif call_count[0] == 2:
                # 第二次：查消息 / Second call: fetch messages
                return MagicMock(data=messages_data, count=None)
            else:
                return MagicMock(data=messages_data, count=total_count)

        sb.execute.side_effect = execute_side_effect
        return sb

    @pytest.mark.asyncio
    async def test_main_thread_returns_history(self):
        """主线 context 包含最近消息历史 / Main thread context contains the recent message history."""
        thread = {"id": "t1", "session_id": "s1", "parent_thread_id": None, "depth": 0, "anchor_text": None}
        messages = [
            {"role": "user", "content": "问题"},
            {"role": "assistant", "content": "回答"},
        ]
        sb = self._make_supabase_mock(thread, messages, total_count=2)

        with patch("services.context_builder.get_supabase", return_value=sb), \
             patch("services.memory_service.retrieve_rag_context", new=AsyncMock(return_value=[])):
            from services.context_builder import build_context
            context = await build_context("t1", query_text="")

        roles = [m["role"] for m in context]
        assert "user" in roles
        assert "assistant" in roles

    @pytest.mark.asyncio
    async def test_thread_not_found_raises_value_error(self):
        """线程不存在时抛出 ValueError / Raises ValueError when the thread does not exist."""
        sb = MagicMock()
        for attr in ("table", "select", "eq", "maybe_single"):
            getattr(sb, attr).return_value = sb
        sb.execute.return_value = MagicMock(data=None)

        with patch("services.context_builder.get_supabase", return_value=sb):
            from services.context_builder import build_context
            with pytest.raises(ValueError, match="不存在"):
                await build_context("nonexistent-thread")

    @pytest.mark.asyncio
    async def test_main_thread_with_history_over_limit_injects_summary(self):
        """消息数超过窗口时注入历史摘要 system 消息 / Injects a history summary system message when message count exceeds the window."""
        thread = {"id": "t1", "session_id": "s1", "parent_thread_id": None, "depth": 0, "anchor_text": None}
        messages = [{"role": "user", "content": f"消息{i}"} for i in range(5)]

        db_calls = [0]
        async def fake_db(fn, **_kw):
            """
            模拟 _db：
              call 1 → 线程查询
              call 2 → 消息查询（gather 第一个参数）
              call 3 → 总数查询（gather 第二个参数，count=100 触发摘要注入）
            Simulate _db:
              call 1 → thread query
              call 2 → messages query (first gather arg)
              call 3 → count query (second gather arg, count=100 triggers summary injection)
            """
            db_calls[0] += 1
            result = MagicMock()
            if db_calls[0] == 1:
                result.data = thread
            elif db_calls[0] == 2:
                result.data = messages
                result.count = None
            else:
                result.data = messages
                result.count = 100  # 超过 _THREAD_MSG_LIMIT=10，触发摘要注入 / exceeds _THREAD_MSG_LIMIT=10
            return result

        from services import context_builder
        with patch.object(context_builder, "_db", side_effect=fake_db), \
             patch("services.memory_service.retrieve_rag_context", new=AsyncMock(return_value=[])), \
             patch.object(context_builder, "_get_or_create_summary", new=AsyncMock(return_value="历史摘要内容")):
            context = await context_builder.build_context("t1", query_text="")

        system_msgs = [m for m in context if m["role"] == "system"]
        assert any("历史摘要内容" in m["content"] for m in system_msgs)

    @pytest.mark.asyncio
    async def test_sub_thread_injects_anchor(self):
        """子线程 context 包含锚点原文 system 消息 / Sub-thread context contains the anchor text as a system message."""
        thread = {
            "id": "t2", "session_id": "s1",
            "parent_thread_id": "t1", "depth": 1,
            "anchor_text": "这是锚点文字",
        }
        parent_thread = {
            "id": "t1", "session_id": "s1",
            "parent_thread_id": None, "depth": 0,
            "anchor_text": None,
        }
        all_threads = [thread, parent_thread]

        sb = MagicMock()
        for attr in ("table", "select", "eq", "order", "limit", "maybe_single"):
            getattr(sb, attr).return_value = sb

        call_count = [0]
        def execute():
            call_count[0] += 1
            if call_count[0] == 1:
                return MagicMock(data=thread)
            elif call_count[0] == 2:
                return MagicMock(data=all_threads)
            elif call_count[0] == 3:
                # 父线程摘要查询
                return MagicMock(data=[{"summary": "父线程摘要", "token_budget": 300}])
            else:
                return MagicMock(data=[], count=None)

        sb.execute.side_effect = execute

        with patch("services.context_builder.get_supabase", return_value=sb), \
             patch("services.memory_service.retrieve_rag_context", new=AsyncMock(return_value=[])):
            from services.context_builder import build_context
            context = await build_context("t2", query_text="")

        system_contents = [m["content"] for m in context if m["role"] == "system"]
        assert any("这是锚点文字" in c for c in system_contents)
