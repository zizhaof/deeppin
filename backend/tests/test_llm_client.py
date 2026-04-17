# tests/test_llm_client.py
"""
LLM 客户端单元测试
Unit tests for the LLM client.

覆盖 / Covers:
  - _load_groq_keys / _load_keys：JSON 数组解析、单 key、无效 JSON、空值过滤
  - pick_model：返回有效模型名
  - _build_model_list：多 key × 多 model 展开
  - SmartRouter：slot 选择、用量追踪、score 计算、恢复时间
  - UsageBucket：时间窗口重置、score 衰减
  - generate_title_and_suggestions：正常解析 + fallback 路径
  - classify_search_intent：YES/NO 判断 + 异常 fallback
  - _strip_think_tags：流式 think 标签过滤
  - merge_threads：合并输出各格式
  - assess_relevance：JSON 解析 + fallback
"""
import os
import time
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


# ── _load_keys（新增多 provider）───────────────────────────────────────

class TestLoadKeys:
    def test_cerebras_keys(self):
        """加载 Cerebras key / Load Cerebras keys."""
        with patch.dict(os.environ, {"CEREBRAS_API_KEYS": '["csk_1", "csk_2"]'}):
            from services.llm_client import _load_keys
            assert _load_keys("CEREBRAS_API_KEYS") == ["csk_1", "csk_2"]

    def test_missing_env_returns_empty(self):
        """未设置的环境变量返回空列表 / Missing env var returns empty list."""
        from services.llm_client import _load_keys
        result = _load_keys("NONEXISTENT_API_KEYS_XXXXXXX")
        assert result == []


# ── pick_model ────────────────────────────────────────────────────────

class TestPickModel:
    def test_returns_string(self):
        """始终返回非空字符串 / Always returns a non-empty string."""
        from services.llm_client import pick_model
        assert isinstance(pick_model(), str)
        assert len(pick_model()) > 0

    def test_chat_model_format(self):
        """chat 返回 provider/model 格式 / chat returns provider/model format."""
        from services.llm_client import pick_model
        model = pick_model("chat")
        assert "/" in model

    def test_summarizer_model_format(self):
        """summarizer 返回 provider/model 格式 / summarizer returns provider/model format."""
        from services.llm_client import pick_model
        model = pick_model("summarizer")
        assert "/" in model


# ── _build_model_list ─────────────────────────────────────────────────

class TestBuildModelList:
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


# ── UsageBucket ───────────────────────────────────────────────────────

class TestUsageBucket:
    def test_fresh_bucket_full_score(self):
        """新桶的 score 应为 1.0 / Fresh bucket should have score 1.0."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        assert bucket.score(spec) == pytest.approx(1.0)

    def test_score_decreases_after_requests(self):
        """请求后 score 降低 / Score decreases after requests."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=1000)
        s = bucket.score(spec)
        assert 0 < s < 1.0

    def test_score_zero_when_rpm_exhausted(self):
        """RPM 耗尽时 score 为 0 / Score is 0 when RPM exhausted."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=2, tpm=100000, rpd=100000, tpd=100000000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=0)
        bucket.record_request(tokens=0)
        assert bucket.score(spec) == 0.0

    def test_failure_penalty(self):
        """失败后 score 被惩罚 / Score is penalized after failure."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        bucket.record_failure()
        s = bucket.score(spec)
        assert s < 1.0

    def test_recovery_time_zero_when_available(self):
        """有余量时恢复时间为 0 / Recovery time is 0 when capacity available."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        assert bucket.seconds_until_recovery(spec) == 0

    def test_recovery_time_positive_when_exhausted(self):
        """耗尽时恢复时间 > 0 / Recovery time > 0 when exhausted."""
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=1, tpm=100000, rpd=100000, tpd=100000000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=0)
        assert bucket.seconds_until_recovery(spec) > 0

    def test_default_reset_tz_is_utc(self):
        """ModelSpec 默认 reset_tz=UTC / Default reset_tz should be UTC."""
        from services.llm_client import ModelSpec
        assert ModelSpec("groq", "test").reset_tz == "UTC"

    def test_gemini_specs_use_pacific_tz(self):
        """Gemini 模型配置为 Pacific Time / Gemini specs must use Pacific Time."""
        from services.llm_client import GEMINI_MODELS
        assert GEMINI_MODELS, "GEMINI_MODELS should not be empty"
        for m in GEMINI_MODELS:
            assert m.reset_tz == "America/Los_Angeles", (
                f"Gemini model {m.model_id} should reset at PT, got {m.reset_tz}"
            )

    def test_day_reset_on_natural_date_boundary(self):
        """跨 reset_tz 自然日时，rpd/tpd 被清零 / Crossing the date boundary in reset_tz zeroes rpd/tpd."""
        from datetime import date, timedelta
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=500)
        assert bucket.rpd_used == 1 and bucket.tpd_used == 500
        # 模拟"昨天" / Simulate yesterday so next _maybe_reset() crosses the boundary
        bucket._day_date = bucket._day_date - timedelta(days=1)
        bucket._maybe_reset()
        assert bucket.rpd_used == 0 and bucket.tpd_used == 0

    def test_day_reset_does_not_touch_minute_counters(self):
        """日边界重置不应清零分钟桶 / Day reset must not touch minute counters."""
        from datetime import timedelta
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=30, tpm=6000, rpd=1000, tpd=500000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=500)
        bucket._day_date = bucket._day_date - timedelta(days=1)
        bucket._maybe_reset()
        assert bucket.rpm_used == 1 and bucket.tpm_used == 500

    def test_recovery_time_matches_next_midnight_utc(self):
        """UTC 日耗尽后恢复时间 ≤ 86400s 且为到下一 UTC 00:00 的秒数 /
        When UTC-tz daily quota is exhausted, recovery time equals seconds to next UTC 00:00."""
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec("groq", "test", rpm=1000, tpm=1_000_000, rpd=1, tpd=1_000_000_000)
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=0)
        secs = bucket.seconds_until_recovery(spec)
        now = datetime.now(ZoneInfo("UTC"))
        seconds_left_today = 86400 - (now.hour * 3600 + now.minute * 60 + now.second)
        assert 0 < secs <= 86400
        # 允许 5 秒漂移 / Allow 5s drift for test jitter
        assert abs(secs - seconds_left_today) < 5

    def test_recovery_time_matches_next_midnight_pacific(self):
        """Gemini slot 的 recovery 应指向 PT 00:00 而非 UTC 00:00 /
        Gemini slot recovery points to PT 00:00, not UTC 00:00."""
        from datetime import datetime
        from zoneinfo import ZoneInfo
        from services.llm_client import UsageBucket, ModelSpec
        spec = ModelSpec(
            "gemini", "test",
            rpm=1000, tpm=1_000_000, rpd=1, tpd=1_000_000_000,
            reset_tz="America/Los_Angeles",
        )
        bucket = UsageBucket(spec)
        bucket.record_request(tokens=0)
        secs = bucket.seconds_until_recovery(spec)
        now_pt = datetime.now(ZoneInfo("America/Los_Angeles"))
        seconds_left_today_pt = 86400 - (now_pt.hour * 3600 + now_pt.minute * 60 + now_pt.second)
        assert 0 < secs <= 86400
        assert abs(secs - seconds_left_today_pt) < 5


# ── SmartRouter ───────────────────────────────────────────────────────

class TestSmartRouter:
    def test_pick_slot_returns_slot(self):
        """有 slot 时返回非空 / Returns a slot when available."""
        from services.llm_client import SmartRouter, ModelSpec
        models = [ModelSpec("groq", "test-model", rpm=30, tpm=6000, rpd=1000, tpd=500000, groups=["chat"])]
        r = SmartRouter(models, {"groq": ["key1"]})
        slot = r._pick_slot("chat")
        assert slot is not None
        assert slot.litellm_model == "groq/test-model"

    def test_pick_slot_none_for_empty_group(self):
        """空分组返回 None / Returns None for empty group."""
        from services.llm_client import SmartRouter, ModelSpec
        models = [ModelSpec("groq", "test", groups=["chat"])]
        r = SmartRouter(models, {"groq": ["key1"]})
        assert r._pick_slot("nonexistent") is None

    def test_picks_highest_score(self):
        """选择 score 最高的 slot / Picks the slot with highest score."""
        from services.llm_client import SmartRouter, ModelSpec
        models = [
            ModelSpec("groq", "model-a", rpm=30, tpm=6000, rpd=1000, tpd=500000, groups=["chat"]),
            ModelSpec("groq", "model-b", rpm=30, tpm=6000, rpd=1000, tpd=500000, groups=["chat"]),
        ]
        r = SmartRouter(models, {"groq": ["key1"]})
        # 消耗 model-a 的额度
        for s in r.slots:
            if s.spec.model_id == "model-a":
                for _ in range(25):
                    s.usage.record_request(tokens=100)
        slot = r._pick_slot("chat")
        assert slot is not None
        assert slot.spec.model_id == "model-b"

    def test_get_status(self):
        """get_status 返回有效结构 / get_status returns valid structure."""
        from services.llm_client import SmartRouter, ModelSpec
        models = [ModelSpec("groq", "m", groups=["chat"])]
        r = SmartRouter(models, {"groq": ["k1"]})
        status = r.get_status()
        assert "chat" in status
        assert len(status["chat"]) == 1
        assert "score" in status["chat"][0]


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
        """返回 YES 时为 True / Returns True when LLM says YES."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="YES")):
            assert await classify_search_intent("今天的股票价格") is True

    @pytest.mark.asyncio
    async def test_no_returns_false(self):
        """返回 NO 时为 False / Returns False when LLM says NO."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="NO")):
            assert await classify_search_intent("解释一下递归") is False

    @pytest.mark.asyncio
    async def test_exception_returns_false(self):
        """LLM 异常时静默返回 False / Returns False silently on exception."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", side_effect=Exception("API down")):
            with patch("services.llm_client.router") as mock_router:
                mock_router.completion = AsyncMock(side_effect=Exception("also down"))
                assert await classify_search_intent("query") is False

    @pytest.mark.asyncio
    async def test_yes_case_insensitive(self):
        """yes（小写）也识别为 True / Lowercase 'yes' is also recognized as True."""
        from services.llm_client import classify_search_intent
        with patch("services.llm_client._summarizer_call", new=AsyncMock(return_value="yes")):
            assert await classify_search_intent("今天天气") is True


# ── _strip_think_tags ─────────────────────────────────────────────────

class TestStripThinkTags:
    """_strip_think_tags 流式过滤器单元测试 / Unit tests for the <think> tag stripper."""

    async def _collect(self, chunks: list[str]) -> str:
        from services.llm_client import _strip_think_tags

        async def _gen():
            for c in chunks:
                yield c

        parts = []
        async for text in _strip_think_tags(_gen()):
            parts.append(text)
        return "".join(parts)

    @pytest.mark.asyncio
    async def test_no_think_tags_passthrough(self):
        result = await self._collect(["hello", " ", "world"])
        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_single_chunk_think_stripped(self):
        result = await self._collect(["<think>reasoning</think>answer"])
        assert result == "answer"

    @pytest.mark.asyncio
    async def test_think_split_across_chunks(self):
        result = await self._collect(["<thi", "nk>rea", "soning</thi", "nk>answer"])
        assert result == "answer"

    @pytest.mark.asyncio
    async def test_newline_after_close_tag_stripped(self):
        result = await self._collect(["<think>x</think>\n\nfinal"])
        assert result == "final"

    @pytest.mark.asyncio
    async def test_content_before_think_preserved(self):
        result = await self._collect(["prefix<think>skip</think>suffix"])
        assert result == "prefixsuffix"

    @pytest.mark.asyncio
    async def test_multiple_think_blocks(self):
        result = await self._collect(["<think>a</think>mid<think>b</think>end"])
        assert result == "midend"

    @pytest.mark.asyncio
    async def test_empty_stream(self):
        result = await self._collect([])
        assert result == ""


# ── merge_threads ─────────────────────────────────────────────────────

def _wrap_fake_stream(gen_fn):
    """将 async generator 函数包装为返回 ChatStreamResult 的 async function，兼容新签名。"""
    from services.llm_client import ChatStreamResult

    async def wrapper(*args, **kwargs):
        return ChatStreamResult(gen_fn(*args, **kwargs))
    return wrapper


class TestMergeThreads:
    async def _collect(self, gen) -> str:
        chunks = []
        async for c in gen:
            chunks.append(c)
        return "".join(chunks)

    @pytest.mark.asyncio
    async def test_empty_threads_data_yields_nothing(self):
        from services.llm_client import merge_threads

        async def fake_stream(_messages, **_kwargs):
            return
            yield

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            result = await self._collect(merge_threads([]))
        assert result == ""

    @pytest.mark.asyncio
    async def test_calls_chat_stream_with_inject_meta_false(self):
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["messages"] = messages
            captured["inject_meta"] = kwargs.get("inject_meta")
            yield "chunk"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            await self._collect(merge_threads([{"title": "T", "anchor": "A", "content": "C"}]))

        assert captured.get("inject_meta") is False

    @pytest.mark.asyncio
    async def test_free_format_in_system_prompt(self):
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="free"))

        assert "流畅" in captured["system"] or "叙述" in captured["system"]

    @pytest.mark.asyncio
    async def test_structured_format_in_system_prompt(self):
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="structured"))

        assert "结构化" in captured["system"] or "权衡" in captured["system"]

    @pytest.mark.asyncio
    async def test_anchor_text_appears_in_user_prompt(self):
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["user"] = messages[1]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            await self._collect(merge_threads([{"title": "My Title", "anchor": "unique_anchor_xyz", "content": "body"}]))

        assert "unique_anchor_xyz" in captured["user"]

    @pytest.mark.asyncio
    async def test_streams_chunks_through(self):
        from services.llm_client import merge_threads

        async def fake_stream(_messages, **_kwargs):
            for w in ["hello", " ", "world"]:
                yield w

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            result = await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}]))

        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_transcript_format_skips_llm(self):
        from services.llm_client import merge_threads

        called = {"count": 0}

        async def fake_stream(_messages, **_kwargs):
            called["count"] += 1
            yield "should not be called"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            result = await self._collect(merge_threads(
                [{"title": "问题一", "anchor": "锚点文本", "content": "用户：hi\nAI：hello"}],
                main_content="用户：主线\nAI：回复",
                format_type="transcript",
            ))

        assert called["count"] == 0
        assert "对话原文" in result
        assert "主线对话" in result
        assert "问题一" in result
        assert "锚点文本" in result
        assert "用户：主线" in result

    @pytest.mark.asyncio
    async def test_unknown_format_falls_back_to_free(self):
        from services.llm_client import merge_threads
        captured = {}

        async def fake_stream(messages, **kwargs):
            captured["system"] = messages[0]["content"]
            yield "ok"

        with patch("services.llm_client.chat_stream", side_effect=_wrap_fake_stream(fake_stream)):
            await self._collect(merge_threads([{"title": "T", "anchor": "", "content": "C"}], format_type="nonexistent"))

        assert "流畅" in captured["system"] or "叙述" in captured["system"]


class TestAssessRelevance:
    @pytest.mark.asyncio
    async def test_returns_parsed_json(self):
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
        mock_response = '好的，分析如下：\n[{"thread_id": "y", "selected": false, "reason": "无关"}]\n完毕'
        with patch("services.llm_client._summarizer_call", new_callable=AsyncMock) as m:
            m.return_value = mock_response
            from services.llm_client import assess_relevance
            result = await assess_relevance("主线", [{"thread_id": "y", "title": "T", "summary": "S"}])
        assert result[0]["selected"] is False
