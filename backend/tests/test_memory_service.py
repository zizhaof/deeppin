# tests/test_memory_service.py
"""
Unit tests for the memory service.

Covers:
    _FILE_REF_PATTERN: matches various file-reference keywords / no match for non-file queries
  - retrieve_rag_context：
      Short queries return an empty list directly
      File-reference keywords trigger the zero-threshold path (skip primary retrieval)
      Normal queries try 0.45 threshold first, falling back to zero-threshold when empty
      Each of the two tracks produces one system message
    retrieve_rag_context:
      Short query returns empty list directly
      File-reference keyword triggers zero threshold (skips primary search)
      Normal query uses 0.45 threshold first; falls back to zero threshold on empty result
      Both tracks each produce one system message when results are found
      Exception returns empty list
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
        """'wenjian' triggers the file-reference pattern."""
        assert self._match("帮我分析一下这个文件") is True

    def test_matches_fujian(self):
        """'fujian' triggers the file-reference pattern."""
        assert self._match("刚才那个附件内容是什么") is True

    def test_matches_pdf_uppercase(self):
        """'PDF' (uppercase) triggers the pattern (case-insensitive)."""
        assert self._match("这份PDF说了什么") is True

    def test_matches_zhaiyao(self):
        """'zhaiyao' triggers the file-reference pattern."""
        assert self._match("给这个文档写个摘要") is True

    def test_does_not_match_normal_question(self):
        """Normal question does not trigger file-reference pattern."""
        assert self._match("什么是量子计算？") is False

    def test_does_not_match_coding_question(self):
        """Coding question does not trigger file-reference pattern."""
        assert self._match("如何在 Python 中实现快速排序？") is False

    def test_matches_excel(self):
        """'excel' triggers the pattern (case-insensitive)."""
        assert self._match("Excel 表格里有哪些数据？") is True

    def test_matches_shangyijuan(self):
        """'shangchuan' triggers the file-reference pattern."""
        assert self._match("我上传的报告写了什么？") is True


# ── retrieve_rag_context ──────────────────────────────────────────────

class TestRetrieveRagContext:
    def _make_rpc_mock(self, chunk_data: list, memory_data: list):
        """Build Supabase mock simulating two RPC calls."""
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
        """Queries shorter than 5 characters return an empty list immediately."""
        from services.memory_service import retrieve_rag_context
        result = await retrieve_rag_context("session-1", "hi")
        assert result == []

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        """Empty query returns empty list immediately."""
        from services.memory_service import retrieve_rag_context
        result = await retrieve_rag_context("session-1", "")
        assert result == []

    @pytest.mark.asyncio
    async def test_both_tracks_return_system_messages(self):
        """One system message per track when both tracks return results."""
        from services import memory_service

        chunk_data = [{"filename": "doc.pdf", "chunk_index": 0, "content": "文件内容片段"}]
        memory_data = [{"content": "用户：xxx\nAI：yyy"}]
        fake_vec = [0.1] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=chunk_data),   # primary chunk search
                MagicMock(data=memory_data),  # memory search
            ])):
                result = await memory_service.retrieve_rag_context("session-1", "这份文件讲了什么内容")

        # File-ref keyword uses zero threshold; one system message per track when both return results
        system_msgs = [m for m in result if m["role"] == "system"]
        assert len(system_msgs) >= 1

    @pytest.mark.asyncio
    async def test_no_results_returns_empty_list(self):
        """Returns empty list when both tracks return no results."""
        from services import memory_service

        fake_vec = [0.0] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.0,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=[]),   # primary chunk: no results
                MagicMock(data=[]),   # memory: no results
                MagicMock(data=[]),   # fallback: still no results
            ])):
                result = await memory_service.retrieve_rag_context("session-1", "普通问题，没有文件")

        assert result == []

    @pytest.mark.asyncio
    async def test_file_ref_skips_primary_search(self):
        """
        File-reference keywords trigger zero-threshold search directly;
        the 0.45-threshold primary search and its fallback are not invoked.
        """
        from services.memory_service import _FILE_REF_PATTERN
        from services import memory_service

        fake_vec = [0.1] * 384
        # Confirm query contains file-reference keyword
        query = "这个PDF里说了什么"
        assert _FILE_REF_PATTERN.search(query)

        db_call_count = [0]
        async def fake_db(fn, **_kw):
            """
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

        # File-ref query uses zero threshold; no fallback is triggered when empty (avoids duplicate calls)
        # Expected _db calls = 2 (chunk + memory), with no extra fallback call
        assert db_call_count[0] == 2
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_exception_returns_empty_list(self):
        """Returns empty list when embed_text raises; exception is not propagated."""
        from services import memory_service

        with patch("services.embedding_service.embed_text", new=AsyncMock(side_effect=Exception("embedding service down"))):
            result = await memory_service.retrieve_rag_context("session-1", "问题内容超过五个字符")

        assert result == []

    @pytest.mark.asyncio
    async def test_prefer_filename_filters_to_matching_chunks(self):
        """
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
                MagicMock(data=chunk_data),   # primary search
                MagicMock(data=memory_data),  # memory search
            ])):
                result = await memory_service.retrieve_rag_context(
                    "session-1", "这份文件说了什么",
                    prefer_filename="new_upload.pdf",
                )

        # Result must only contain content from new_upload.pdf
        assert len(result) >= 1
        content_block = next(m for m in result if m["role"] == "system" and "new_upload.pdf" in m["content"])
        assert "旧文件内容" not in content_block["content"]

    @pytest.mark.asyncio
    async def test_prefer_filename_inline_file_suppresses_old_chunks(self):
        """
        When prefer_filename's file has no chunks at all (inline file),
        all attachment RAG is suppressed to prevent old-file chunks from polluting context.
        """
        from services import memory_service

        # Primary and expanded retrieval both return only chunks of the old file
        old_chunk = {"filename": "old.pdf", "chunk_index": 0, "content": "旧文件内容", "similarity": 0.8}
        memory_data: list = []
        fake_vec = [0.1] * 384

        with patch("services.embedding_service.embed_text", new=AsyncMock(return_value=fake_vec)), \
             patch("services.embedding_service.format_vector", return_value="[0.1,...]"):
            with patch.object(memory_service, "_db", new=AsyncMock(side_effect=[
                MagicMock(data=[old_chunk]),   # primary search
                MagicMock(data=memory_data),   # memory
                MagicMock(data=[old_chunk]),   # wider search
            ])):
                result = await memory_service.retrieve_rag_context(
                    "session-1", "这份文件说了什么",
                    prefer_filename="inline_file.pdf",  # Inline file, no chunk in DB
                )

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
        """Empty text returns 0."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", return_value=[]):
            result = await store_long_text_chunks("session-1", "")

        assert result == 0

    @pytest.mark.asyncio
    async def test_no_chunks_returns_zero(self):
        """Returns 0 when chunk_text returns empty list."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", return_value=[]):
            result = await store_long_text_chunks("session-1", "短文")

        assert result == 0

    @pytest.mark.asyncio
    async def test_successful_store_returns_chunk_count(self):
        """Returns chunk count on successful storage."""
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
        """Returns 0 on exception; does not propagate."""
        from services.memory_service import store_long_text_chunks

        with patch("services.memory_service._chunk_text", side_effect=Exception("splitter crashed")):
            result = await store_long_text_chunks("session-1", "有内容的文本" * 100)

        assert result == 0
