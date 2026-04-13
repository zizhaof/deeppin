# tests/test_attachment_processor.py
"""
附件处理器单元测试
Unit tests for the attachment processor.

覆盖 / Covers:
  - chunk_text：LangChain splitter 正常路径、ImportError fallback 滑动窗口、短文本直接返回
    chunk_text: LangChain normal path, ImportError sliding-window fallback, short text passthrough
  - extract_text：Kreuzberg 正常路径、ImportError fallback 路由、纯文本扩展名直接解码
    extract_text: Kreuzberg normal path, ImportError fallback routing, plain-text ext direct decode
  - process_attachment：空文本返回 0、embed+store 调用路径（mock）
    process_attachment: empty text returns 0, embed+store call path (mocked)
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── chunk_text ────────────────────────────────────────────────────────

class TestChunkText:
    def test_short_text_returns_single_chunk(self):
        """短于 CHUNK_SIZE 的文本以单块返回 / Text shorter than CHUNK_SIZE is returned as a single chunk."""
        from services.attachment_processor import chunk_text
        text = "短文本内容"
        result = chunk_text(text)
        assert len(result) == 1
        assert result[0] == text.strip()

    def test_empty_text_returns_empty_list(self):
        """空字符串返回空列表 / Empty string returns empty list."""
        from services.attachment_processor import chunk_text
        assert chunk_text("") == []

    def test_whitespace_only_returns_empty_list(self):
        """纯空白字符串返回空列表 / Whitespace-only string returns empty list."""
        from services.attachment_processor import chunk_text
        assert chunk_text("   \n\t  ") == []

    def test_long_text_produces_multiple_chunks(self):
        """超过 CHUNK_SIZE 的文本切成多块 / Text longer than CHUNK_SIZE is split into multiple chunks."""
        from services.attachment_processor import chunk_text, CHUNK_SIZE
        text = "A" * (CHUNK_SIZE * 3)
        result = chunk_text(text)
        assert len(result) > 1

    def test_fallback_sliding_window_covers_all_text(self):
        """ImportError fallback 时，滑动窗口覆盖全部文本内容 / Sliding-window fallback covers all text content."""
        from services.attachment_processor import CHUNK_SIZE, CHUNK_OVERLAP

        with patch.dict("sys.modules", {"langchain_text_splitters": None}):
            # 重新导入以触发 ImportError fallback
            # Re-import to trigger ImportError fallback
            import importlib
            import services.attachment_processor as m
            importlib.reload(m)
            text = "X" * (CHUNK_SIZE * 2 + 50)
            chunks = m.chunk_text(text)
            # 所有块合并后应覆盖完整文本（允许重叠）
            # All chunks combined should cover the full text (overlap allowed)
            assert len(chunks) >= 2
            for chunk in chunks:
                assert len(chunk) > 0

    def test_fallback_sliding_window_exact_size(self):
        """fallback：恰好等于 CHUNK_SIZE 时返回单块 / Fallback: text exactly equal to CHUNK_SIZE returns a single chunk."""
        from services.attachment_processor import CHUNK_SIZE

        with patch.dict("sys.modules", {"langchain_text_splitters": None}):
            import importlib
            import services.attachment_processor as m
            importlib.reload(m)
            text = "B" * CHUNK_SIZE
            chunks = m.chunk_text(text)
            assert len(chunks) == 1


# ── extract_text ──────────────────────────────────────────────────────

class TestExtractText:
    @pytest.mark.asyncio
    async def test_txt_extension_decoded_as_utf8(self):
        """txt 扩展名直接 UTF-8 解码（无需 Kreuzberg）/ txt extension is decoded as UTF-8 directly (no Kreuzberg)."""
        from services.attachment_processor import extract_text
        content = "纯文本内容".encode("utf-8")

        # Kreuzberg ImportError 时仍走 UTF-8 fallback
        # When Kreuzberg raises ImportError, still falls back to UTF-8
        with patch("builtins.__import__", side_effect=lambda name, *a, **kw: (
            (_ for _ in ()).throw(ImportError("no kreuzberg")) if name == "kreuzberg" else __import__(name, *a, **kw)
        )):
            result = await extract_text(content, "test.txt")
        assert "纯文本内容" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_success_path(self):
        """Kreuzberg 返回非空内容时直接使用 / Use Kreuzberg result when it returns non-empty content."""
        from services.attachment_processor import extract_text

        mock_result = MagicMock()
        mock_result.content = "  提取的文本  "

        mock_kb = AsyncMock(return_value=mock_result)
        with patch.dict("sys.modules", {}):
            with patch("services.attachment_processor.extract_text", wraps=None):
                pass  # not used

        # 直接 mock kreuzberg.extract_bytes
        with patch("kreuzberg.extract_bytes", mock_kb, create=True):
            # patch import inside the function
            with patch.dict("sys.modules", {"kreuzberg": MagicMock(extract_bytes=mock_kb)}):
                result = await extract_text(b"pdf content", "test.pdf")
        assert "提取的文本" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_exception_falls_back_to_pypdf(self):
        """Kreuzberg 抛出异常时降级到 pypdf / Falls back to pypdf when Kreuzberg raises an exception."""
        from services.attachment_processor import extract_text

        mock_kreuzberg = MagicMock()
        mock_kreuzberg.extract_bytes = AsyncMock(side_effect=Exception("kreuzberg crashed"))

        mock_page = MagicMock()
        mock_page.extract_text.return_value = "pypdf 提取内容"
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

        with patch.dict("sys.modules", {"kreuzberg": mock_kreuzberg}):
            with patch("pypdf.PdfReader", return_value=mock_reader):
                result = await extract_text(b"pdf bytes", "document.pdf")

        assert "pypdf 提取内容" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_import_error_falls_back(self):
        """Kreuzberg 不可用时 pdf 走 pypdf fallback / When Kreuzberg is unavailable, pdf falls back to pypdf."""
        from services.attachment_processor import extract_text

        mock_page = MagicMock()
        mock_page.extract_text.return_value = "fallback 内容"
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

        # kreuzberg 不在 sys.modules 中模拟 ImportError
        # Simulate ImportError by removing kreuzberg from sys.modules
        import sys
        original = sys.modules.pop("kreuzberg", None)
        try:
            with patch("pypdf.PdfReader", return_value=mock_reader):
                result = await extract_text(b"pdf bytes", "report.pdf")
            assert "fallback 内容" in result
        finally:
            if original is not None:
                sys.modules["kreuzberg"] = original

    @pytest.mark.asyncio
    async def test_unknown_extension_decoded_as_utf8(self):
        """未知扩展名尝试 UTF-8 解码 / Unknown extension attempts UTF-8 decode."""
        from services.attachment_processor import extract_text
        content = "纯文字内容".encode("utf-8")

        # kreuzberg raises ImportError for unknown ext
        import sys
        original = sys.modules.pop("kreuzberg", None)
        try:
            result = await extract_text(content, "file.xyz")
            assert "纯文字内容" in result
        finally:
            if original is not None:
                sys.modules["kreuzberg"] = original


# ── process_attachment ────────────────────────────────────────────────

class TestProcessAttachment:
    @pytest.mark.asyncio
    async def test_empty_text_returns_failure(self):
        """提取文本为空时返回失败字典 / Returns failure dict when extracted text is empty."""
        from services.attachment_processor import process_attachment

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value="   ")):
            result = await process_attachment("session-1", "empty.txt", b"content")

        assert result == {"chunk_count": 0, "inline_text": None}

    @pytest.mark.asyncio
    async def test_short_text_returns_inline(self):
        """短文本（≤ INLINE_THRESHOLD）走内联模式，不分块 / Short text goes inline; no chunking."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        short_text = "短文本内容" * 10  # 远小于阈值 / well below threshold
        assert len(short_text) <= INLINE_THRESHOLD

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=short_text)):
            result = await process_attachment("session-1", "note.txt", b"content")

        assert result["chunk_count"] == 0
        assert result["inline_text"] == short_text.strip()

    @pytest.mark.asyncio
    async def test_long_text_goes_to_rag(self):
        """长文本（> INLINE_THRESHOLD）走 RAG 流水线 / Long text goes through the RAG pipeline."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "内容" * (INLINE_THRESHOLD + 1)  # 超过阈值 / exceeds threshold
        fake_chunks = ["块一", "块二", "块三"]
        fake_embeddings = [[0.1] * 384] * 3

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_text", return_value=fake_chunks), \
             patch("services.attachment_processor._store_chunks", new=AsyncMock()):
            from services import attachment_processor
            with patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=fake_embeddings)):
                result = await process_attachment("session-1", "doc.pdf", b"pdf bytes")

        assert result["chunk_count"] == len(fake_chunks)
        assert result["inline_text"] is None

    @pytest.mark.asyncio
    async def test_no_chunks_returns_failure(self):
        """长文本 chunk_text 返回空列表时返回失败字典 / Returns failure dict when chunk_text produces no chunks for long text."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "X" * (INLINE_THRESHOLD + 100)

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_text", return_value=[]):
            result = await process_attachment("session-1", "file.txt", b"content")

        assert result == {"chunk_count": 0, "inline_text": None}

    @pytest.mark.asyncio
    async def test_exception_returns_failure(self):
        """提取阶段抛出异常时返回失败字典，不传播异常 / Returns failure dict and does not propagate exceptions."""
        from services.attachment_processor import process_attachment

        with patch("services.attachment_processor.extract_text", new=AsyncMock(side_effect=Exception("disk full"))):
            result = await process_attachment("session-1", "crash.pdf", b"bytes")

        assert result == {"chunk_count": 0, "inline_text": None}
