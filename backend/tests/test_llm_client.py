# tests/test_llm_client.py
"""
LLM 客户端单元测试
Unit tests for the LLM client.

覆盖 / Covers:
  - _load_groq_keys：JSON 数组解析、单 key、无效 JSON、空值过滤
    _load_groq_keys: JSON array parsing, single key, invalid JSON, empty value filtering
  - pick_model：chat / summarizer 返回格式
    pick_model: return format for chat / summarizer
  - _build_model_list：多 key × 多 model 展开
    _build_model_list: expansion of multiple keys × multiple models
  - generate_title_and_suggestions：正常解析 + fallback 路径
    generate_title_and_suggestions: normal parsing + fallback paths
  - classify_search_intent：YES/NO 判断 + 异常 fallback
    classify_search_intent: YES/NO detection + exception fallback
"""
import os
import pytest
from unittest.mock import patch, AsyncMock


# ── _load_groq_keys ───────────────────────────────────────────────────

class TestLoadGroqKeys:
    def test_valid_json_array(self):
        """有效 JSON 数组解析正确 / Valid JSON array is parsed correctly."""
        with patch.dict(os.environ, {"GROQ_API_KEYS": '["key1", "key2", "key3"]'}):
            from importlib import reload
            import services.llm_client as m
            reload(m)
            assert m._load_groq_keys() == ["key1", "key2", "key3"]

    def test_empty_values_filtered(self):
        """数组中的空字符串被过滤掉 / Empty strings in the array are filtered out."""
        with patch.dict(os.environ, {"GROQ_API_KEYS": '["key1", "", "key2"]'}):
            from importlib import reload
            import services.llm_client as m
            result = m._load_groq_keys()
            assert "" not in result
            assert "key1" in result
            assert "key2" in result

    def test_invalid_json_falls_back_to_raw(self):
        """无效 JSON 时将整个字符串作为单个 key 返回 / Invalid JSON returns the raw string as a single key."""
        with patch.dict(os.environ, {"GROQ_API_KEYS": "not-json-but-a-key"}):
            from importlib import reload
            import services.llm_client as m
            result = m._load_groq_keys()
            assert result == ["not-json-but-a-key"]

    def test_empty_env_returns_empty_list(self):
        """环境变量为空字符串时返回空列表 / Empty env var returns empty list."""
        with patch.dict(os.environ, {"GROQ_API_KEYS": ""}):
            from importlib import reload
            import services.llm_client as m
            result = m._load_groq_keys()
            assert result == []

    def test_empty_json_array(self):
        """空 JSON 数组返回空列表 / Empty JSON array returns empty list."""
        with patch.dict(os.environ, {"GROQ_API_KEYS": "[]"}):
            from importlib import reload
            import services.llm_client as m
            result = m._load_groq_keys()
            assert result == []


# ── pick_model ────────────────────────────────────────────────────────

class TestPickModel:
    def test_returns_string(self):
        """始终返回非空字符串 / Always returns a non-empty string."""
        from services.llm_client import pick_model
        assert isinstance(pick_model(), str)
        assert len(pick_model()) > 0

    def test_chat_model_format(self):
        """chat 返回 groq/model 格式 / chat returns groq/model format."""
        from services.llm_client import pick_model
        model = pick_model("chat")
        assert model.startswith("groq/")
        assert "/" in model

    def test_summarizer_model_format(self):
        """summarizer 返回 groq/model 格式 / summarizer returns groq/model format."""
        from services.llm_client import pick_model
        model = pick_model("summarizer")
        assert model.startswith("groq/")

    def test_unknown_type_returns_summarizer(self):
        """未知 model_type 返回 summarizer 的首选模型 / Unknown model_type returns the summarizer's first model."""
        from services.llm_client import pick_model, SUMMARIZER_MODELS
        model = pick_model("nonexistent")
        assert SUMMARIZER_MODELS[0] in model


# ── _build_model_list ─────────────────────────────────────────────────

class TestBuildModelList:
    def test_expands_keys_and_models(self):
        """每个 key × 每个 chat model 都应出现在 model_list 中 / Each key × chat model combination appears in model_list."""
        from services.llm_client import _build_model_list, CHAT_MODELS, GROQ_API_KEYS
        model_list = _build_model_list()
        chat_entries = [e for e in model_list if e["model_name"] == "chat"]
        # 至少包含 CHAT_MODELS × GROQ_API_KEYS 数量的条目
        # At least len(CHAT_MODELS) × len(GROQ_API_KEYS) entries
        assert len(chat_entries) >= len(CHAT_MODELS) * len(GROQ_API_KEYS)

    def test_all_entries_have_required_fields(self):
        """每个条目都有 model_name 和 litellm_params / Every entry has model_name and litellm_params."""
        from services.llm_client import _build_model_list
        for entry in _build_model_list():
            assert "model_name" in entry
            assert "litellm_params" in entry
            assert "model" in entry["litellm_params"]
            assert "api_key" in entry["litellm_params"]

    def test_model_names_are_valid_groups(self):
        """model_name 只能是已知分组 / model_name must be one of the known groups."""
        from services.llm_client import _build_model_list
        valid_names = {"chat", "merge", "summarizer", "vision"}
        for entry in _build_model_list():
            assert entry["model_name"] in valid_names


# ── generate_title_and_suggestions ───────────────────────────────────

class TestGenerateTitleAndSuggestions:
    @pytest.mark.asyncio
    async def test_parses_well_formed_output(self):
        """正常格式输出解析正确 / Well-formed output is parsed correctly."""
        from services.llm_client import generate_title_and_suggestions
        mock_output = "TITLE: 测试标题\nQ1: 第一个追问？\nQ2: 第二个追问？\nQ3: 第三个追问？"
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value=mock_output)):
            title, questions = await generate_title_and_suggestions("anchor text")
        assert title == "测试标题"
        assert len(questions) == 3
        assert questions[0] == "第一个追问？"

    @pytest.mark.asyncio
    async def test_falls_back_to_anchor_on_no_title(self):
        """无标题时截取锚点前 20 字 / Falls back to the first 20 chars of anchor when no title is present."""
        from services.llm_client import generate_title_and_suggestions
        mock_output = "Q1: 问题一\nQ2: 问题二\nQ3: 问题三"
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value=mock_output)):
            title, _ = await generate_title_and_suggestions("这是一个很长的锚点文字" * 5)
        assert len(title) <= 20

    @pytest.mark.asyncio
    async def test_falls_back_to_generic_questions_on_empty(self):
        """无追问时返回通用兜底问题 / Returns generic fallback questions when none are parsed."""
        from services.llm_client import generate_title_and_suggestions
        mock_output = "TITLE: 标题\n（无追问）"
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value=mock_output)):
            _, questions = await generate_title_and_suggestions("anchor")
        assert len(questions) == 3

    @pytest.mark.asyncio
    async def test_returns_at_most_3_questions(self):
        """最多返回 3 个建议追问 / Returns at most 3 suggested questions."""
        from services.llm_client import generate_title_and_suggestions
        mock_output = "TITLE: 标题\nQ1: A\nQ2: B\nQ3: C"
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value=mock_output)):
            _, questions = await generate_title_and_suggestions("anchor")
        assert len(questions) <= 3


# ── classify_search_intent ────────────────────────────────────────────

class TestClassifySearchIntent:
    @pytest.mark.asyncio
    async def test_yes_returns_true(self):
        """返回 YES 时 classify_search_intent 为 True / Returns True when LLM says YES."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="YES")):
            assert await classify_search_intent("今天的股票价格") is True

    @pytest.mark.asyncio
    async def test_no_returns_false(self):
        """返回 NO 时 classify_search_intent 为 False / Returns False when LLM says NO."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="NO")):
            assert await classify_search_intent("解释一下递归") is False

    @pytest.mark.asyncio
    async def test_exception_returns_false(self):
        """LLM 异常时静默返回 False，不阻断主流程 / Returns False silently on exception; must not block the main flow."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", side_effect=Exception("API down")):
            assert await classify_search_intent("query") is False

    @pytest.mark.asyncio
    async def test_yes_case_insensitive(self):
        """yes（小写）也识别为 True / Lowercase 'yes' is also recognized as True."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="yes")):
            assert await classify_search_intent("今天天气") is True


# ── merge_threads ─────────────────────────────────────────────────────

class TestMergeThreads:
    """merge_threads 的单元测试 / Unit tests for merge_threads."""

    async def _collect(self, gen) -> str:
        """将 AsyncGenerator 收集为字符串 / Collect an AsyncGenerator into a string."""
        chunks = []
        async for c in gen:
            chunks.append(c)
        return "".join(chunks)

    @pytest.mark.asyncio
    async def test_empty_threads_data_yields_nothing(self):
        """空列表不产生任何 chunk / Empty list yields no chunks."""
        from services.llm_client import merge_threads

        async def fake_stream(_messages, **_kwargs):
            return
            yield  # make it an async generator

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            result = await self._collect(merge_threads([]))
        assert result == ""

    @pytest.mark.asyncio
    async def test_calls_chat_stream_with_inject_meta_false(self):
        """必须以 inject_meta=False 调用 chat_stream，避免注入 META 标记
        Must call chat_stream with inject_meta=False to avoid injecting META markers."""
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["messages"] = messages
            captured["inject_meta"] = kwargs.get("inject_meta")
            yield "chunk"

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            await self._collect(merge_threads([{"title": "T", "anchor": "A", "content": "C"}]))

        assert captured.get("inject_meta") is False

    @pytest.mark.asyncio
    async def test_free_format_in_system_prompt(self):
        """format_type='free' 时 system prompt 包含自由总结指令
        format_type='free' puts the free-form instruction in the system prompt."""
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="free"))

        assert "流畅" in captured["system"] or "叙述" in captured["system"]

    @pytest.mark.asyncio
    async def test_structured_format_in_system_prompt(self):
        """format_type='structured' 时 system prompt 包含结构化分析指令
        format_type='structured' puts the structured-analysis instruction in the system prompt."""
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="structured"))

        assert "结构化" in captured["system"] or "权衡" in captured["system"]

    @pytest.mark.asyncio
    async def test_anchor_text_appears_in_user_prompt(self):
        """锚点文字出现在发送给 LLM 的 user 消息中
        Anchor text appears in the user message sent to the LLM."""
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["user"] = messages[1]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            await self._collect(merge_threads([{"title": "My Title", "anchor": "unique_anchor_xyz", "content": "body"}]))

        assert "unique_anchor_xyz" in captured["user"]

    @pytest.mark.asyncio
    async def test_streams_chunks_through(self):
        """chat_stream 产生的 chunk 逐一 yield 出去
        Chunks from chat_stream are yielded one by one."""
        from services.llm_client import merge_threads

        async def fake_stream(_messages, **_kwargs):
            for w in ["hello", " ", "world"]:
                yield w

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            result = await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}]))

        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_unknown_format_falls_back_to_free(self):
        """未知 format_type 时使用自由总结指令作为兜底
        Unknown format_type falls back to the free-form instruction."""
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=fake_stream):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="nonexistent"))

        # free format contains "流畅" or "叙述"
        assert "流畅" in captured["system"] or "叙述" in captured["system"]


class TestAssessRelevance:
    @pytest.mark.asyncio
    async def test_returns_parsed_json(self):
        """LLM 返回合法 JSON 时直接解析 / Parses valid JSON returned by LLM."""
        mock_response = '[{"thread_id": "abc", "selected": true, "reason": "相关"}]'
        with patch("services.llm_client._summarizer_call", new_callable=AsyncMock) as m:
            m.return_value = mock_response
            from services.llm_client import assess_relevance
            result = await assess_relevance(
                main_summary="主线摘要内容",
                threads=[{"thread_id": "abc", "title": "标题", "summary": "内容"}],
            )
        assert result == [{"thread_id": "abc", "selected": True, "reason": "相关"}]

    @pytest.mark.asyncio
    async def test_fallback_on_invalid_json(self):
        """LLM 返回非法 JSON 时所有线程默认选中 / Falls back to all-selected on invalid JSON."""
        with patch("services.llm_client._summarizer_call", new_callable=AsyncMock) as m:
            m.return_value = "抱歉，无法解析"
            from services.llm_client import assess_relevance
            result = await assess_relevance(
                main_summary="主线摘要",
                threads=[
                    {"thread_id": "x1", "title": "A", "summary": "aa"},
                    {"thread_id": "x2", "title": "B", "summary": "bb"},
                ],
            )
        assert len(result) == 2
        assert all(r["selected"] is True for r in result)
        assert {r["thread_id"] for r in result} == {"x1", "x2"}

    @pytest.mark.asyncio
    async def test_json_embedded_in_text(self):
        """JSON 嵌在文本中也能提取 / Extracts JSON array even when surrounded by text."""
        mock_response = '好的，分析如下：\n[{"thread_id": "y", "selected": false, "reason": "无关"}]\n完毕'
        with patch("services.llm_client._summarizer_call", new_callable=AsyncMock) as m:
            m.return_value = mock_response
            from services.llm_client import assess_relevance
            result = await assess_relevance("主线", [{"thread_id": "y", "title": "T", "summary": "S"}])
        assert result[0]["selected"] is False
