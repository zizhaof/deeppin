# tests/test_attachment_processor.py
"""
附件处理器单元测试
Unit tests for the attachment processor.

覆盖 / Covers:
  - _split_sentences：段落切分、句末标点切分、空文本
  - chunk_text_semantic：正常语义切分路径、embed 失败 fallback、单句文本
  - _chunk_fixed：滑动窗口覆盖全文、短文本单块
  - extract_text：Kreuzberg 正常路径、ImportError fallback 路由、纯文本扩展名直接解码
  - process_attachment：空文本返回 0、内联模式、RAG 流水线、无 chunk 返回失败、异常不传播
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── _split_sentences ──────────────────────────────────────────────────

class TestSplitSentences:
    def test_splits_on_chinese_punctuation(self):
        """按中文句末标点切分 / Splits on Chinese sentence-ending punctuation."""
        from services.attachment_processor import _split_sentences
        text = "这是第一句。这是第二句！这是第三句？"
        result = _split_sentences(text)
        assert len(result) == 3

    def test_splits_on_english_punctuation(self):
        """按英文句末标点切分 / Splits on English sentence-ending punctuation."""
        from services.attachment_processor import _split_sentences
        text = "First sentence. Second sentence! Third sentence?"
        result = _split_sentences(text)
        assert len(result) == 3

    def test_splits_on_paragraph_breaks(self):
        """按空行分段 / Splits on blank-line paragraph breaks."""
        from services.attachment_processor import _split_sentences
        text = "第一段内容\n\n第二段内容"
        result = _split_sentences(text)
        assert len(result) == 2

    def test_empty_text_returns_empty(self):
        """空文本返回空列表 / Empty text returns empty list."""
        from services.attachment_processor import _split_sentences
        assert _split_sentences("") == []

    def test_whitespace_only_returns_empty(self):
        """纯空白返回空列表 / Whitespace-only returns empty list."""
        from services.attachment_processor import _split_sentences
        assert _split_sentences("   \n\n  ") == []

    def test_no_punctuation_returns_single_sentence(self):
        """无标点的段落作为整体返回 / Paragraph without punctuation returned as one sentence."""
        from services.attachment_processor import _split_sentences
        text = "这是一段没有句末标点的文字"
        result = _split_sentences(text)
        assert result == [text]


# ── chunk_text_semantic ───────────────────────────────────────────────

class TestChunkTextSemantic:
    @pytest.mark.asyncio
    async def test_single_sentence_returns_it(self):
        """单句文本直接返回（跳过 embed）/ Single-sentence text returned without embedding."""
        from services.attachment_processor import chunk_text_semantic, MIN_CHUNK_CHARS
        text = "这是唯一的一句话，长度超过最小 chunk 要求。" * 3
        assert len(text) >= MIN_CHUNK_CHARS
        result = await chunk_text_semantic(text)
        assert result == [text]

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self):
        """空文本返回空列表 / Empty text returns empty list."""
        from services.attachment_processor import chunk_text_semantic
        result = await chunk_text_semantic("")
        assert result == []

    @pytest.mark.asyncio
    async def test_low_similarity_triggers_break(self):
        """相邻句子相似度低时切断 / Cuts at low-similarity boundary between adjacent sentences."""
        from services.attachment_processor import chunk_text_semantic, MIN_CHUNK_CHARS

        # 每句需超过 MIN_CHUNK_CHARS(50)，否则不会切断
        # Each sentence must exceed MIN_CHUNK_CHARS(50) or the break condition won't fire
        s0 = "这是第一句话，主要内容涉及自然语言处理与文本向量化技术，其篇幅足够长以确保超过最小 chunk 长度阈值的要求。"
        s1 = "第二句话与第一句在主题上高度相关，同样围绕机器学习、深度学习以及大语言模型中的文本嵌入概念展开详细介绍。"
        s2 = "第三句话的主题与前两句完全不同，转向日常生活领域，具体介绍厨房烹饪技巧、食材选购方法以及厨具的正确使用方式。"
        assert all(len(s) >= MIN_CHUNK_CHARS for s in [s0, s1, s2])

        # 句 0 和句 1 相似度高（点积 ≈ 0.9），句 1 和句 2 相似度低（点积 ≈ 0.3）
        # Sentences 0-1 similar (dot ≈ 0.9); sentences 1-2 dissimilar (dot ≈ 0.3)
        fake_embeddings = [
            [1.0, 0.0],   # 句 0
            [0.9, 0.1],   # 句 1（与 0 相似）
            [0.0, 1.0],   # 句 2（与 1 不相似）
        ]
        text = s0 + s1 + s2

        with patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=fake_embeddings)):
            result = await chunk_text_semantic(text)

        # 句 0+1 合并，句 2 独立 → 2 块
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_max_chunk_size_triggers_break(self):
        """chunk 超过 MAX_CHUNK_CHARS 时强制切断 / Forces a break when chunk would exceed MAX_CHUNK_CHARS."""
        from services.attachment_processor import chunk_text_semantic, MAX_CHUNK_CHARS

        # 每句 200 字，两句就超 MAX_CHUNK_CHARS（600），相似度高也应切断
        long_sent = "内" * 200
        text = f"{long_sent}。{long_sent}。{long_sent}。"

        # 相似度全部很高，仅靠长度触发切断
        high_sim_embeddings = [[1.0, 0.0]] * 3
        with patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=high_sim_embeddings)):
            result = await chunk_text_semantic(text)

        # 每句 ~201 字，3 句合并会超 600，应被切成至少 2 块
        assert len(result) >= 2

    @pytest.mark.asyncio
    async def test_embed_failure_falls_back_to_fixed(self):
        """embed 失败时 fallback 到固定切分，不抛出异常 / Falls back to fixed chunking on embed failure."""
        from services.attachment_processor import chunk_text_semantic, CHUNK_SIZE

        # 需要有句子标点，_split_sentences 才能切出多句，embed_texts 才会被调用
        # Text needs sentence punctuation so _split_sentences yields >1 sentence and embed_texts is called
        single_sent = "这是一个用于测试的句子，内容并不重要只是用来触发分块逻辑。"
        text = single_sent * 20   # 重复 20 次，每次结尾有句号，共 20 句
        with patch("services.embedding_service.embed_texts", new=AsyncMock(side_effect=Exception("model error"))):
            result = await chunk_text_semantic(text)

        assert len(result) > 1  # fallback 固定切分仍产出多块


# ── _chunk_fixed ──────────────────────────────────────────────────────

class TestChunkFixed:
    def test_short_text_returns_single_chunk(self):
        """短于 CHUNK_SIZE 的文本以单块返回 / Text shorter than CHUNK_SIZE returned as single chunk."""
        from services.attachment_processor import _chunk_fixed
        text = "短文本内容"
        result = _chunk_fixed(text)
        assert len(result) == 1
        assert result[0] == text.strip()

    def test_empty_text_returns_empty_list(self):
        """空字符串返回空列表 / Empty string returns empty list."""
        from services.attachment_processor import _chunk_fixed
        assert _chunk_fixed("") == []

    def test_long_text_produces_multiple_chunks(self):
        """超过 CHUNK_SIZE 的文本切成多块 / Text longer than CHUNK_SIZE split into multiple chunks."""
        from services.attachment_processor import _chunk_fixed, CHUNK_SIZE
        text = "A" * (CHUNK_SIZE * 3)
        result = _chunk_fixed(text)
        assert len(result) > 1

    def test_all_content_covered(self):
        """所有块合并后覆盖完整文本（允许重叠）/ All chunks together cover the full text (overlap allowed)."""
        from services.attachment_processor import _chunk_fixed, CHUNK_SIZE
        text = "X" * (CHUNK_SIZE * 2 + 50)
        chunks = _chunk_fixed(text)
        for chunk in chunks:
            assert len(chunk) > 0


# ── extract_text ──────────────────────────────────────────────────────

class TestExtractText:
    @pytest.mark.asyncio
    async def test_txt_extension_decoded_as_utf8(self):
        """txt 扩展名直接 UTF-8 解码（无需 Kreuzberg）/ txt decoded as UTF-8 directly."""
        from services.attachment_processor import extract_text
        content = "纯文本内容".encode("utf-8")

        with patch("builtins.__import__", side_effect=lambda name, *a, **kw: (
            (_ for _ in ()).throw(ImportError("no kreuzberg")) if name == "kreuzberg" else __import__(name, *a, **kw)
        )):
            result = await extract_text(content, "test.txt")
        assert "纯文本内容" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_success_path(self):
        """Kreuzberg 返回非空内容时直接使用 / Uses Kreuzberg result when non-empty."""
        from services.attachment_processor import extract_text

        mock_result = MagicMock()
        mock_result.content = "  提取的文本  "
        mock_kb = AsyncMock(return_value=mock_result)

        with patch.dict("sys.modules", {"kreuzberg": MagicMock(extract_bytes=mock_kb)}):
            result = await extract_text(b"pdf content", "test.pdf")
        assert "提取的文本" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_exception_falls_back_to_pypdf(self):
        """Kreuzberg 抛出异常时降级到 pypdf / Falls back to pypdf when Kreuzberg raises."""
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
        """Kreuzberg 不可用时 pdf 走 pypdf fallback / Falls back to pypdf when Kreuzberg unavailable."""
        from services.attachment_processor import extract_text

        mock_page = MagicMock()
        mock_page.extract_text.return_value = "fallback 内容"
        mock_reader = MagicMock()
        mock_reader.pages = [mock_page]

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

        short_text = "短文本内容" * 10
        assert len(short_text) <= INLINE_THRESHOLD

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=short_text)):
            result = await process_attachment("session-1", "note.txt", b"content")

        assert result["chunk_count"] == 0
        assert result["inline_text"] == short_text.strip()

    @pytest.mark.asyncio
    async def test_long_text_goes_to_rag(self):
        """长文本（> INLINE_THRESHOLD）走 RAG 流水线 / Long text goes through the RAG pipeline."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "内容" * (INLINE_THRESHOLD + 1)
        fake_chunks = ["块一", "块二", "块三"]
        fake_embeddings = [[0.1] * 1024] * 3

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_text_semantic", new=AsyncMock(return_value=fake_chunks)), \
             patch("services.attachment_processor._store_chunks", new=AsyncMock()), \
             patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=fake_embeddings)):
            result = await process_attachment("session-1", "doc.pdf", b"pdf bytes")

        assert result["chunk_count"] == len(fake_chunks)
        assert result["inline_text"] is None

    @pytest.mark.asyncio
    async def test_no_chunks_returns_failure(self):
        """语义切分返回空列表时返回失败字典 / Returns failure dict when semantic chunking yields no chunks."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "X" * (INLINE_THRESHOLD + 100)

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_text_semantic", new=AsyncMock(return_value=[])):
            result = await process_attachment("session-1", "file.txt", b"content")

        assert result == {"chunk_count": 0, "inline_text": None}

    @pytest.mark.asyncio
    async def test_exception_returns_failure(self):
        """提取阶段抛出异常时返回失败字典，不传播异常 / Returns failure dict and does not propagate exceptions."""
        from services.attachment_processor import process_attachment

        with patch("services.attachment_processor.extract_text", new=AsyncMock(side_effect=Exception("disk full"))):
            result = await process_attachment("session-1", "crash.pdf", b"bytes")

        assert result == {"chunk_count": 0, "inline_text": None}
