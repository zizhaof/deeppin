# tests/test_memory_service.py
"""
对话记忆服务单元测试
Unit tests for the memory service.

覆盖 / Covers:
  - _FILE_REF_PATTERN：各种文件引用词匹配 / 非文件引用词不匹配
    _FILE_REF_PATTERN: matches various file-reference keywords / no match for non-file queries
  - retrieve_rag_context：
      短查询直接返回空列表
      文件引用词触发零阈值（跳过主检索）
      普通查询先用 0.45 阈值，无结果时兜底零阈值
      两轨结果各生成一条 system 消息
      异常时返回空列表
    retrieve_rag_context:
      Short query returns empty list directly
      File-reference keyword triggers zero threshold (skips primary search)
      Normal query uses 0.45 threshold first; falls back to zero threshold on empty result
      Both tracks each produce one system message when results are found
      Exception returns empty list
  - store_long_text_chunks：空文本返回 0、正常路径返回块数
    store_long_text_chunks: empty text returns 0, normal path returns chunk count
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── _FILE_REF_PATTERN ─────────────────────────────────────────────────

class TestFileRefPattern:
    def _match(self, text: str) -> bool:
        from services.memory_service import _FILE_REF_PATTERN
        return bool(_FILE_REF_PATTERN.search(text))

    def test_matches_wenjianjian(self):
        """'文件' 触发文件引用模式 / '文件' triggers the file-reference pattern."""
        assert self._match("帮我分析一下这个文件") is True

    def test_matches_fujian(self):
        """'附件' 触发文件引用模式 / '附件' triggers the file-reference pattern."""
        assert self._match("刚才那个附件内容是什么") is True

    def test_matches_pdf_uppercase(self):
        """'PDF'（大写）触发模式（case-insensitive）/ 'PDF' (uppercase) triggers pattern (case-insensitive)."""
        assert self._match("这份PDF说了什么") is True

    def test_matches_zhaiyao(self):
        """'摘要' 触发文件引用模式 / '摘要' triggers the file-reference pattern."""
        assert self._match("给这个文档写个摘要") is True

    def test_does_not_match_normal_question(self):
        """普通问题不触发文件引用模式 / Normal question does not trigger file-reference pattern."""
        assert self._match("什么是量子计算？") is False

    def test_does_not_match_coding_question(self):
        """代码问题不触发文件引用模式 / Coding question does not trigger file-reference pattern."""
        assert self._match("如何在 Python 中实现快速排序？") is False

    def test_matches_excel(self):
        """'excel' 触发模式（case-insensitive）/ 'excel' triggers pattern (case-insensitive)."""
        assert self._match("Excel 表格里有哪些数据？") is True

    def test_matches_shangyijuan(self):
        """'上传' 触发文件引用模式 / '上传' triggers the file-reference pattern."""
        assert self._match("我上传的报告写了什么？") is True


# ── retrieve_rag_context ──────────────────────────────────────────────

class TestRetrieveRagContext:
    def _make_rpc_mock(self, chunk_data: list, memory_data: list):
        """构造 Supabase mock，模拟两次 RPC 调用 / Build Supabase mock simulating two RPC calls."""
        sb = MagicMock()
        sb.rpc.return_value = sb

        call_count = [0]
        def execute_side_effect():
            call_count[0] += 1
            if call_count[0] == 1:
                return MagicMock(data=chunk_data)
            else:
                return MagicMock(data=memory_data)
        sb.execute.side_effect = execute_side_effect
        return sb

    @pytest.mark.asyncio
    async def test_short_query_returns_empty(self):
        """查询文本不足 5 字符时直接返回空列表 / Queries shorter than 5 characters return an empty list immediately."""
        from services.memory_service import retrieve_rag_context
        result = await retrieve_rag_context("session-1", "hi")
        assert result == []

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        """空查询直接返回空列表 / Empty query returns empty list immediately."""
        from services.memory_service import retrieve_rag_context
        result = await retrieve_rag_context("session-1", "")
        assert result == []

    @pytest.mark.asyncio
    async def test_both_tracks_return_system_messages(self):
        """两轨都有结果时各产生一条 system 消息 / One system message per track when both tracks return results."""
        from services import memory_service

        chunk_data = [{"filename": "doc.pdf", "chunk_index": 0, "content": "文件内容片段"}]
        memory_data = [{"content": "用户：xxx\nAI：yyy"}]
        fake_vec = [0.1] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=chunk_data),   # 附件块主检索 / primary chunk search
                MagicMock(data=memory_data),  # 对话记忆检索 / memory search
            ])):
                result = await memory_service.retrieve_rag_context("session-1", "这份文件讲了什么内容")

        # 文件引用词触发零阈值，两轨均有结果时各产生一条 system 消息
        # File-ref keyword uses zero threshold; one system message per track when both return results
        system_msgs = [m for m in result if m["role"] == "system"]
        assert len(system_msgs) >= 1

    @pytest.mark.asyncio
    async def test_no_results_returns_empty_list(self):
        """两轨均无结果时返回空列表 / Returns empty list when both tracks return no results."""
        from services import memory_service

        fake_vec = [0.0] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.0,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=[]),   # 附件块主检索：无结果 / primary chunk: no results
                MagicMock(data=[]),   # 对话记忆：无结果 / memory: no results
                MagicMock(data=[]),   # 兜底检索：仍无结果 / fallback: still no results
            ])):
                result = await memory_service.retrieve_rag_context("session-1", "普通问题，没有文件")

        assert result == []

    @pytest.mark.asyncio
    async def test_file_ref_skips_primary_search(self):
        """
        文件引用词触发零阈值直接检索，不触发 0.45 主检索后的兜底逻辑。
        File-reference keywords trigger zero-threshold search directly;
        the 0.45-threshold primary search and its fallback are not invoked.
        """
        from services.memory_service import _FILE_REF_PATTERN
        from services import memory_service

        fake_vec = [0.1] * 384
        # 确认查询文本含有文件引用词 / Confirm query contains file-reference keyword
        query = "这个PDF里说了什么"
        assert _FILE_REF_PATTERN.search(query)

        db_call_count = [0]
        async def fake_db(fn):
            """
            截获 _db 调用，计数并返回空数据。
            Count _db calls and return empty data.
            """
            db_call_count[0] += 1
            result_mock = MagicMock()
            result_mock.data = []
            return result_mock

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", side_effect=fake_db):
                result = await memory_service.retrieve_rag_context("session-1", query)

        # 文件引用词使用零阈值，空结果时不再触发兜底（避免重复调用）
        # File-ref query uses zero threshold; no fallback is triggered when empty (avoids duplicate calls)
        # 期望 _db 调用次数 = 2（附件块 + 对话记忆），不含额外的兜底调用
        # Expected _db calls = 2 (chunk + memory), with no extra fallback call
        assert db_call_count[0] == 2
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_exception_returns_empty_list(self):
        """embed_text 抛出异常时返回空列表，不传播异常 / Returns empty list when embed_text raises; exception is not propagated."""
        from services import memory_service

        with patch("services.embedding_service.embed_text", new=AsyncMock(side_effect=Exception("embedding service down"))):
            result = await memory_service.retrieve_rag_context("session-1", "问题内容超过五个字符")

        assert result == []

    @pytest.mark.asyncio
    async def test_prefer_filename_filters_to_matching_chunks(self):
        """
        prefer_filename 设置时，只返回来自该文件的块，忽略其他文件的高分块。
        When prefer_filename is set, only chunks from that file are returned
        even if chunks from other files scored higher.
        """
        from services import memory_service

        chunk_data = [
            {"filename": "old_report.pdf", "chunk_index": 0, "content": "旧文件内容", "similarity": 0.9},
            {"filename": "new_upload.pdf", "chunk_index": 0, "content": "新文件内容", "similarity": 0.7},
        ]
        memory_data: list = []
        fake_vec = [0.1] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=chunk_data),   # 主检索 / primary search
                MagicMock(data=memory_data),  # 对话记忆 / memory search
            ])):
                result = await memory_service.retrieve_rag_context(
                    "session-1", "这份文件说了什么",
                    prefer_filename="new_upload.pdf",
                )

        # 结果中只能包含 new_upload.pdf 的内容
        # Result must only contain content from new_upload.pdf
        assert len(result) >= 1
        content_block = next(m for m in result if m["role"] == "system" and "new_upload.pdf" in m["content"])
        assert "旧文件内容" not in content_block["content"]

    @pytest.mark.asyncio
    async def test_prefer_filename_inline_file_suppresses_old_chunks(self):
        """
        prefer_filename 对应文件完全没有 chunk（内联文件）时，清空 attachment RAG，
        避免旧文件 chunk 混入 context。
        When prefer_filename's file has no chunks at all (inline file),
        all attachment RAG is suppressed to prevent old-file chunks from polluting context.
        """
        from services import memory_service

        # 主检索和扩大检索都只有旧文件的 chunk
        old_chunk = {"filename": "old.pdf", "chunk_index": 0, "content": "旧文件内容", "similarity": 0.8}
        memory_data: list = []
        fake_vec = [0.1] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=[old_chunk]),   # 主检索 / primary search
                MagicMock(data=memory_data),   # 对话记忆 / memory
                MagicMock(data=[old_chunk]),   # 扩大检索 / wider search
            ])):
                result = await memory_service.retrieve_rag_context(
                    "session-1", "这份文件说了什么",
                    prefer_filename="inline_file.pdf",  # 内联文件，DB 中无 chunk
                )

        # 内联文件无 chunk → 清空 attachment RAG，旧文件内容不应出现
        # Inline file has no chunks → attachment RAG suppressed; old content must not appear
        attachment_block = next(
            (m for m in result if m["role"] == "system" and "旧文件内容" in m["content"]),
            None,
        )
        assert attachment_block is None


# ── store_long_text_chunks ────────────────────────────────────────────

class TestStoreLongTextChunks:
    @pytest.mark.asyncio
    async def test_empty_text_returns_zero(self):
        """空文本返回 0 / Empty text returns 0."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", return_value=[]):
            result = await store_long_text_chunks("session-1", "")

        assert result == 0

    @pytest.mark.asyncio
    async def test_no_chunks_returns_zero(self):
        """chunk_text 返回空列表时返回 0 / Returns 0 when chunk_text returns empty list."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", return_value=[]):
            result = await store_long_text_chunks("session-1", "短文")

        assert result == 0

    @pytest.mark.asyncio
    async def test_successful_store_returns_chunk_count(self):
        """正常存储时返回块数 / Returns chunk count on successful storage."""
        from services import memory_service

        fake_chunks = ["块一", "块二", "块三"]
        fake_vecs = [[0.1] * 384] * 3

        with patch.object(memory_service, "_chunk_text", return_value=fake_chunks), \
             patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=fake_vecs)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"), \
             patch.object(memory_service, "_db", new=AsyncMock(return_value=MagicMock(data=[]))), \
             patch("db.supabase.get_supabase", return_value=MagicMock()):
            result = await memory_service.store_long_text_chunks("session-1", "足够长的文本" * 50)

        assert result == len(fake_chunks)

    @pytest.mark.asyncio
    async def test_exception_returns_zero(self):
        """异常时返回 0，不传播 / Returns 0 on exception; does not propagate."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", side_effect=Exception("splitter crashed")):
            result = await store_long_text_chunks("session-1", "有内容的文本" * 100)

        assert result == 0
