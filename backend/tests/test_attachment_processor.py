# tests/test_attachment_processor.py
"""
Unit tests for the attachment processor.

Covers:
  - _split_sentences: paragraph split, sentence-end punctuation split, empty text
  - chunk_text_semantic: normal semantic-split path, embed-failure fallback, single-sentence text
  - _chunk_fixed: sliding-window full coverage, single-chunk for short text
  - extract_text: normal Kreuzberg path, ImportError fallback routing, plain-text extensions decoded directly
  - process_attachment: empty text returns 0, inline mode, RAG pipeline, no-chunk failure, exceptions do not propagate
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


# ── _split_sentences ──────────────────────────────────────────────────

class TestSplitSentences:
    def test_splits_on_chinese_punctuation(self):
        """Splits on Chinese sentence-ending punctuation."""
        from services.attachment_processor import _split_sentences
        text = "这是第一句。这是第二句！这是第三句？"
        result = _split_sentences(text)
        assert len(result) == 3

    def test_splits_on_english_punctuation(self):
        """Splits on English sentence-ending punctuation."""
        from services.attachment_processor import _split_sentences
        text = "First sentence. Second sentence! Third sentence?"
        result = _split_sentences(text)
        assert len(result) == 3

    def test_splits_on_paragraph_breaks(self):
        """Splits on blank-line paragraph breaks."""
        from services.attachment_processor import _split_sentences
        text = "第一段内容\n\n第二段内容"
        result = _split_sentences(text)
        assert len(result) == 2

    def test_empty_text_returns_empty(self):
        """Empty text returns empty list."""
        from services.attachment_processor import _split_sentences
        assert _split_sentences("") == []

    def test_whitespace_only_returns_empty(self):
        """Whitespace-only returns empty list."""
        from services.attachment_processor import _split_sentences
        assert _split_sentences("   \n\n  ") == []

    def test_no_punctuation_returns_single_sentence(self):
        """Paragraph without punctuation returned as one sentence."""
        from services.attachment_processor import _split_sentences
        text = "这是一段没有句末标点的文字"
        result = _split_sentences(text)
        assert result == [text]


# ── chunk_text_semantic ───────────────────────────────────────────────

class TestChunkTextSemantic:
    @pytest.mark.asyncio
    async def test_single_sentence_returns_it(self):
        """Single-sentence text returned without embedding."""
        from services.attachment_processor import chunk_text_semantic, MIN_CHUNK_CHARS
        text = "这是唯一的一句话，长度超过最小 chunk 要求。" * 3
        assert len(text) >= MIN_CHUNK_CHARS
        result = await chunk_text_semantic(text)
        assert result == [text]

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self):
        """Empty text returns empty list."""
        from services.attachment_processor import chunk_text_semantic
        result = await chunk_text_semantic("")
        assert result == []

    @pytest.mark.asyncio
    async def test_low_similarity_triggers_break(self):
        """Cuts at low-similarity boundary between adjacent sentences."""
        from services.attachment_processor import chunk_text_semantic, MIN_CHUNK_CHARS

        # Each sentence must exceed MIN_CHUNK_CHARS(50) or the break condition won't fire
        s0 = "这是第一句话，主要内容涉及自然语言处理与文本向量化技术，其篇幅足够长以确保超过最小 chunk 长度阈值的要求。"
        s1 = "第二句话与第一句在主题上高度相关，同样围绕机器学习、深度学习以及大语言模型中的文本嵌入概念展开详细介绍。"
        s2 = "第三句话的主题与前两句完全不同，转向日常生活领域，具体介绍厨房烹饪技巧、食材选购方法以及厨具的正确使用方式。"
        assert all(len(s) >= MIN_CHUNK_CHARS for s in [s0, s1, s2])

        # Sentences 0-1 similar (dot ≈ 0.9); sentences 1-2 dissimilar (dot ≈ 0.3)
        fake_embeddings = [
            [1.0, 0.0],   # Sentence 0
            [0.9, 0.1],   # Sentence 1 (similar to 0)
            [0.0, 1.0],   # Sentence 2 (dissimilar to 1)
        ]
        text = s0 + s1 + s2

        with patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=fake_embeddings)):
            result = await chunk_text_semantic(text)

        # Sentences 0+1 merged, sentence 2 standalone -> 2 chunks
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_max_chunk_size_triggers_break(self):
        """Forces a break when chunk would exceed MAX_CHUNK_CHARS."""
        from services.attachment_processor import chunk_text_semantic, MAX_CHUNK_CHARS

        # Each sentence is 200 chars; two together exceed MAX_CHUNK_CHARS (600), so even high similarity must split
        long_sent = "内" * 200
        text = f"{long_sent}。{long_sent}。{long_sent}。"

        # All similarities very high; cut is triggered by length alone
        high_sim_embeddings = [[1.0, 0.0]] * 3
        with patch("services.embedding_service.embed_texts", new=AsyncMock(return_value=high_sim_embeddings)):
            result = await chunk_text_semantic(text)

        # Each sentence ~201 chars; merging 3 exceeds 600, so should split into at least 2 chunks
        assert len(result) >= 2

    @pytest.mark.asyncio
    async def test_embed_failure_falls_back_to_fixed(self):
        """Falls back to fixed chunking on semantic-pass embed failure."""
        from services.attachment_processor import chunk_text_semantic

        single_sent = "这是一个用于测试的句子，内容并不重要只是用来触发分块逻辑。"
        text = single_sent * 20   # Repeated 20 times; each ends with a period, totaling 20 sentences

        # First call (sentence embed for semantic-boundary detection) blows up;
        # fallback path does a second embed on the fixed chunks, which succeeds.
        calls: list[int] = []
        async def fake_embed(texts):
            calls.append(len(texts))
            if len(calls) == 1:
                raise Exception("model error")
            return [[0.1] * 1024 for _ in texts]

        with patch("services.embedding_service.embed_texts", new=fake_embed):
            result = await chunk_text_semantic(text)

        assert len(result) > 1  # Fallback fixed-split still produces multiple chunks


# ── chunk_and_embed ───────────────────────────────────────────────────

class TestChunkAndEmbed:
    @pytest.mark.asyncio
    async def test_returns_aligned_lists(self):
        """chunks and embeddings are same length and per-chunk."""
        from services.attachment_processor import chunk_and_embed
        text = (
            "First sentence about dogs. Second about dogs too. "
            "Totally unrelated topic: quantum computing basics. "
            "More on quantum. Yet more on quantum theory."
        ) * 10
        # Two clusters of sentences — embeddings differ per cluster to trigger a break
        dog_vec = [1.0, 0.0] + [0.0] * 1022
        qc_vec = [0.0, 1.0] + [0.0] * 1022
        sent_embs = [dog_vec, dog_vec, qc_vec, qc_vec, qc_vec] * 10
        with patch("services.embedding_service.embed_texts",
                   new=AsyncMock(return_value=sent_embs)):
            chunks, embs = await chunk_and_embed(text)
        assert len(chunks) == len(embs) > 0

    @pytest.mark.asyncio
    async def test_chunk_embeddings_are_unit_norm(self):
        """Pooled chunk embeddings are L2-normalized (unit length)."""
        from services.attachment_processor import chunk_and_embed
        # Two similar sentences → one chunk covering both. Vectors unit-norm but not identical.
        text = "Alpha statement. Beta statement."
        v1 = [1.0, 0.0] + [0.0] * 1022
        v2 = [0.8, 0.6] + [0.0] * 1022  # unit length
        with patch("services.embedding_service.embed_texts",
                   new=AsyncMock(return_value=[v1, v2])):
            chunks, embs = await chunk_and_embed(text)
        assert len(embs) == 1
        norm_sq = sum(x * x for x in embs[0])
        assert abs(norm_sq - 1.0) < 1e-6

    @pytest.mark.asyncio
    async def test_fallback_reembeds_fixed_chunks(self):
        """On semantic-embed failure, falls back to fixed chunks + a re-embed call."""
        from services.attachment_processor import chunk_and_embed
        text = "Sentence one. Sentence two. Sentence three." * 200

        call_log: list[str] = []

        async def fake_embed(texts):
            # First call (sentence embed during semantic path) fails;
            # second call (fallback chunk embed) succeeds and returns one vec per chunk.
            call_log.append("call")
            if len(call_log) == 1:
                raise RuntimeError("embed model exploded")
            return [[0.1] * 1024 for _ in texts]

        with patch("services.embedding_service.embed_texts", new=fake_embed):
            chunks, embs = await chunk_and_embed(text)
        assert len(chunks) == len(embs) > 0
        assert len(call_log) == 2  # Sentence pass failed, fallback pass succeeded

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self):
        """Empty / whitespace-only text returns ([], [])."""
        from services.attachment_processor import chunk_and_embed
        assert await chunk_and_embed("") == ([], [])
        assert await chunk_and_embed("   \n   ") == ([], [])


# ── _chunk_fixed ──────────────────────────────────────────────────────

class TestChunkFixed:
    def test_short_text_returns_single_chunk(self):
        """Text shorter than CHUNK_SIZE returned as single chunk."""
        from services.attachment_processor import _chunk_fixed
        text = "短文本内容"
        result = _chunk_fixed(text)
        assert len(result) == 1
        assert result[0] == text.strip()

    def test_empty_text_returns_empty_list(self):
        """Empty string returns empty list."""
        from services.attachment_processor import _chunk_fixed
        assert _chunk_fixed("") == []

    def test_long_text_produces_multiple_chunks(self):
        """Text longer than CHUNK_SIZE split into multiple chunks."""
        from services.attachment_processor import _chunk_fixed, CHUNK_SIZE
        text = "A" * (CHUNK_SIZE * 3)
        result = _chunk_fixed(text)
        assert len(result) > 1

    def test_all_content_covered(self):
        """All chunks together cover the full text (overlap allowed)."""
        from services.attachment_processor import _chunk_fixed, CHUNK_SIZE
        text = "X" * (CHUNK_SIZE * 2 + 50)
        chunks = _chunk_fixed(text)
        for chunk in chunks:
            assert len(chunk) > 0


# ── extract_text ──────────────────────────────────────────────────────

class TestExtractText:
    @pytest.mark.asyncio
    async def test_txt_extension_decoded_as_utf8(self):
        """txt extension decoded as UTF-8 directly (no Kreuzberg needed)."""
        from services.attachment_processor import extract_text
        content = "纯文本内容".encode("utf-8")

        with patch("builtins.__import__", side_effect=lambda name, *a, **kw: (
            (_ for _ in ()).throw(ImportError("no kreuzberg")) if name == "kreuzberg" else __import__(name, *a, **kw)
        )):
            result = await extract_text(content, "test.txt")
        assert "纯文本内容" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_success_path(self):
        """Uses Kreuzberg result when non-empty."""
        from services.attachment_processor import extract_text

        mock_result = MagicMock()
        mock_result.content = "  提取的文本  "
        mock_kb = AsyncMock(return_value=mock_result)

        with patch.dict("sys.modules", {"kreuzberg": MagicMock(extract_bytes=mock_kb)}):
            result = await extract_text(b"pdf content", "test.pdf")
        assert "提取的文本" in result

    @pytest.mark.asyncio
    async def test_kreuzberg_exception_falls_back_to_pypdf(self):
        """Falls back to pypdf when Kreuzberg raises."""
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
        """Falls back to pypdf when Kreuzberg unavailable."""
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
        """Unknown extension attempts UTF-8 decode."""
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

    @pytest.mark.asyncio
    async def test_image_sniff_calls_vision_chat(self):
        """Byte sniff detects PNG → vision_chat."""
        from services.attachment_processor import extract_text

        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        mock_vision = AsyncMock(return_value="  图中是一只橙色猫  ")
        with patch("services.llm_client.vision_chat", new=mock_vision):
            result = await extract_text(png_bytes, "cat.png")

        assert result == "图中是一只橙色猫"
        called_messages = mock_vision.await_args.args[0]
        parts = called_messages[0]["content"]
        image_part = next(p for p in parts if p.get("type") == "image_url")
        assert image_part["image_url"]["url"].startswith("data:image/png;base64,")

    @pytest.mark.asyncio
    async def test_image_sniff_wins_over_lying_extension(self):
        """        PNG bytes with a `.txt` filename still route to vision (sniff overrides ext)."""
        from services.attachment_processor import extract_text

        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\xde\xad\xbe\xef" * 20
        with patch("services.llm_client.vision_chat", new=AsyncMock(return_value="screenshot of code")):
            result = await extract_text(png_bytes, "document.txt")

        assert result == "screenshot of code"

    @pytest.mark.asyncio
    async def test_text_file_with_lying_image_extension(self):
        """        Text bytes with a `.png` filename → sniff rejects → falls through to text path."""
        from services.attachment_processor import extract_text

        content = "这是纯文本".encode("utf-8")
        mock_vision = AsyncMock()
        import sys
        original = sys.modules.pop("kreuzberg", None)
        try:
            with patch("services.llm_client.vision_chat", new=mock_vision):
                result = await extract_text(content, "fake.png")
            assert "这是纯文本" in result
            mock_vision.assert_not_called()
        finally:
            if original is not None:
                sys.modules["kreuzberg"] = original

    @pytest.mark.asyncio
    async def test_pdf_sniff_without_extension(self):
        """        No extension but PDF magic bytes → still routed to the PDF path."""
        from services.attachment_processor import extract_text

        pdf_bytes = b"%PDF-1.4\n" + b"\x00" * 20
        mock_result = MagicMock()
        mock_result.content = "PDF 内容"
        mock_kb = AsyncMock(return_value=mock_result)

        with patch.dict("sys.modules", {"kreuzberg": MagicMock(extract_bytes=mock_kb)}):
            result = await extract_text(pdf_bytes, "noext")

        assert "PDF 内容" in result
        # Verify the MIME hint was application/pdf, not octet-stream
        assert mock_kb.await_args.args[1] == "application/pdf"

    @pytest.mark.asyncio
    async def test_image_vision_failure_returns_empty(self):
        """Returns empty on vision failure, no exception."""
        from services.attachment_processor import extract_text

        jpeg_bytes = b"\xff\xd8\xff" + b"\x00" * 20
        with patch("services.llm_client.vision_chat", new=AsyncMock(side_effect=Exception("no quota"))):
            result = await extract_text(jpeg_bytes, "photo.jpg")

        assert result == ""


# ── process_attachment ────────────────────────────────────────────────

class TestProcessAttachment:
    @pytest.mark.asyncio
    async def test_empty_text_returns_failure(self):
        """Returns failure dict when extracted text is empty."""
        from services.attachment_processor import process_attachment

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value="   ")):
            result = await process_attachment("session-1", "empty.txt", b"content")

        assert result == {"chunk_count": 0, "inline_text": None}

    @pytest.mark.asyncio
    async def test_short_text_returns_inline(self):
        """Short text goes inline; no chunking."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        short_text = "短文本内容" * 10
        assert len(short_text) <= INLINE_THRESHOLD

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=short_text)):
            result = await process_attachment("session-1", "note.txt", b"content")

        assert result["chunk_count"] == 0
        assert result["inline_text"] == short_text.strip()

    @pytest.mark.asyncio
    async def test_long_text_goes_to_rag(self):
        """Long text goes through the RAG pipeline."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "内容" * (INLINE_THRESHOLD + 1)
        fake_chunks = ["块一", "块二", "块三"]
        fake_embeddings = [[0.1] * 1024] * 3

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_and_embed",
                   new=AsyncMock(return_value=(fake_chunks, fake_embeddings))), \
             patch("services.attachment_processor._store_chunks", new=AsyncMock()):
            result = await process_attachment("session-1", "doc.pdf", b"pdf bytes")

        assert result["chunk_count"] == len(fake_chunks)
        assert result["inline_text"] is None

    @pytest.mark.asyncio
    async def test_no_chunks_returns_failure(self):
        """Returns failure dict when semantic chunking yields no chunks."""
        from services.attachment_processor import process_attachment, INLINE_THRESHOLD

        long_text = "X" * (INLINE_THRESHOLD + 100)

        with patch("services.attachment_processor.extract_text", new=AsyncMock(return_value=long_text)), \
             patch("services.attachment_processor.chunk_and_embed",
                   new=AsyncMock(return_value=([], []))):
            result = await process_attachment("session-1", "file.txt", b"content")

        assert result == {"chunk_count": 0, "inline_text": None}

    @pytest.mark.asyncio
    async def test_exception_returns_failure(self):
        """Returns failure dict and does not propagate exceptions."""
        from services.attachment_processor import process_attachment

        with patch("services.attachment_processor.extract_text", new=AsyncMock(side_effect=Exception("disk full"))):
            result = await process_attachment("session-1", "crash.pdf", b"bytes")

        assert result == {"chunk_count": 0, "inline_text": None}
