# backend/services/llm_client.py
"""
LiteLLM Router 封装 — 全部使用 Groq，动态路由 + 自动 fallback
LiteLLM Router wrapper — all calls use Groq with dynamic routing and automatic fallback.

模型分组 / Model groups:
  chat       → 主对话，6 个模型 × N 个 key，所有组合耗尽才 fallback 到 summarizer
               Main conversation: 6 models × N keys; falls back to summarizer only when all are exhausted
  summarizer → compact 摘要、分类、格式化，极端情况下临时接主对话
               Summary compaction, classification, formatting; can temporarily handle main chat in extremis
  vision     → 图片理解（llama-4-scout）
               Image understanding (llama-4-scout)
  whisper    → 语音转文字，走 Groq 原生 API
               Speech-to-text via the native Groq API
"""
from __future__ import annotations

import os
import json
import random
from typing import AsyncGenerator

from litellm import Router
from dotenv import load_dotenv

load_dotenv()


def _load_groq_keys() -> list[str]:
    """
    从环境变量 GROQ_API_KEYS 加载 API key 列表（JSON 数组格式）。
    Load the API key list from the GROQ_API_KEYS env var (JSON array format).
    """
    raw = os.getenv("GROQ_API_KEYS", "[]")
    try:
        parsed = json.loads(raw)
        return [k for k in parsed if k] if isinstance(parsed, list) else [raw]
    except json.JSONDecodeError:
        return [raw] if raw else []


GROQ_API_KEYS: list[str] = _load_groq_keys()

# chat 梯队：主对话模型，usage-based 路由，429 自动 fallback
# Chat tier: main conversation models, usage-based routing, automatic 429 fallback
CHAT_MODELS = [
    "openai/gpt-oss-120b",
    "moonshotai/kimi-k2-instruct",
    "moonshotai/kimi-k2-instruct-0905",
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]

# merge 梯队：仅包含 TPM ≥ 10K 的模型，用于合并输出（输入通常 8K+ tokens）
# Merge tier: only models with TPM ≥ 10K; used for merge output (input often 8K+ tokens)
# 排除 openai/gpt-oss-120b (8K TPM) 和 qwen/qwen3-32b (6K TPM)
MERGE_MODELS = [
    "moonshotai/kimi-k2-instruct",           # 10K TPM
    "moonshotai/kimi-k2-instruct-0905",      # 10K TPM
    "llama-3.3-70b-versatile",               # 12K TPM
    "meta-llama/llama-4-scout-17b-16e-instruct",  # 30K TPM
]

# summarizer 梯队：轻量任务（摘要、分类、格式化）
# Summarizer tier: lightweight tasks (summarization, classification, formatting)
SUMMARIZER_MODELS = [
    "llama-3.1-8b-instant",
    "openai/gpt-oss-20b",
    # allam-2-7b 移除：阿拉伯语专用，不支持中文，context window 约 4K 容易超限
]

# vision 专用模型 / Vision-specific model
_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _build_model_list() -> list[dict]:
    """
    展开所有 key × 模型组合，生成 LiteLLM Router 所需的 model_list。
    Expand all key × model combinations to build the model_list for the LiteLLM Router.
    """
    model_list = []
    for key in GROQ_API_KEYS:
        for model in CHAT_MODELS:
            model_list.append({
                "model_name": "chat",
                "litellm_params": {"model": f"groq/{model}", "api_key": key},
            })
        for model in MERGE_MODELS:
            model_list.append({
                "model_name": "merge",
                "litellm_params": {"model": f"groq/{model}", "api_key": key},
            })
        for model in SUMMARIZER_MODELS:
            model_list.append({
                "model_name": "summarizer",
                "litellm_params": {"model": f"groq/{model}", "api_key": key},
            })
        model_list.append({
            "model_name": "vision",
            "litellm_params": {"model": f"groq/{_VISION_MODEL}", "api_key": key},
        })
    return model_list


def _build_router() -> Router:
    """
    构建 LiteLLM Router，配置 usage-based 路由和 fallback 链。
    Build the LiteLLM Router with usage-based routing and fallback chain.

    fallback 链 / Fallback chain:
      chat  → summarizer  （chat 全部耗尽时）
      merge → chat        （merge 全部耗尽时降级到全量 chat 组）
    """
    model_list = _build_model_list()
    total_chat = len(GROQ_API_KEYS) * len(CHAT_MODELS)
    return Router(
        model_list=model_list,
        routing_strategy="usage-based-routing",  # 优先选剩余额度最多的 / Prefer the model with most remaining quota
        num_retries=3,
        retry_after=5,
        fallbacks=[
            {"chat": ["summarizer"]},       # chat 全部耗尽 → 降级到 summarizer
            {"merge": ["chat"]},            # merge 耗尽 → 降级到 chat
            {"summarizer": ["chat"]},       # summarizer TPM/RPD 打满 → 降级到 chat
        ],
        allowed_fails=total_chat,
    )


router: Router = _build_router()

# META 块：嵌入主对话末尾，解析出摘要和标题，省去额外 LLM 调用
# META block: appended at the end of the main reply; parsing it avoids extra LLM calls
META_SENTINEL = "<<<META>>>"


async def _strip_think_tags(
    raw: AsyncGenerator[str, None],
) -> AsyncGenerator[str, None]:
    """
    过滤推理模型输出的 <think>…</think> 块，避免内部推理暴露给用户。
    流式处理：缓冲跨 chunk 的不完整标签，只 yield 标签外的内容。

    Strip <think>…</think> blocks emitted by reasoning models (e.g. qwen3, deepseek-r1)
    so users never see internal chain-of-thought.
    Stateful: buffers partial tags that may span chunk boundaries.
    """
    in_think = False
    buf = ""

    async for chunk in raw:
        buf += chunk
        while True:
            if in_think:
                end = buf.find("</think>")
                if end == -1:
                    # 可能是 </think> 前缀，保留尾部以防跨 chunk
                    # May be a partial </think> prefix — keep the tail to handle cross-chunk splits
                    keep = max(0, len(buf) - len("</think>") + 1)
                    buf = buf[keep:]
                    break
                else:
                    buf = buf[end + len("</think>"):]
                    in_think = False
                    # 跳过 </think> 后的空白行（模型通常输出 \n\n 后再开始正文）
                    # Skip blank lines right after </think> (models typically emit \n\n before the answer)
                    buf = buf.lstrip("\n")
            else:
                start = buf.find("<think>")
                if start == -1:
                    # 保留可能是 <think> 前缀的尾部 / Keep tail that might be a partial <think> prefix
                    keep = max(0, len(buf) - len("<think>") + 1)
                    if keep > 0:
                        yield buf[:keep]
                    buf = buf[keep:]
                    break
                else:
                    if start > 0:
                        yield buf[:start]
                    buf = buf[start + len("<think>"):]
                    in_think = True

    # 清空剩余缓冲（不在 think 块内）/ Flush remaining buffer if outside a think block
    if buf and not in_think:
        yield buf


def pick_model(model_type: str = "chat") -> str:
    """
    返回当前 model_type 的首选模型 ID（用于日志/调试）。
    Return the preferred model ID for the given model_type (for logging/debugging).
    """
    if model_type == "chat":
        return f"groq/{CHAT_MODELS[0]}"
    return f"groq/{SUMMARIZER_MODELS[0]}"


async def chat_stream(
    messages: list[dict],
    model_type: str = "chat",
    need_title: bool = False,
    summary_budget: int = 100,
    inject_meta: bool = True,
) -> AsyncGenerator[str, None]:
    """
    主对话流式生成器，每次 yield 一个文字 chunk。
    Main conversation streaming generator; yields one text chunk at a time.

    Router 负责跨模型 × 跨 key 的 429 重试和 chat → summarizer fallback。
    The Router handles 429 retries across models × keys and the chat → summarizer fallback.

    inject_meta=True（默认）：在 context 末尾注入 META 指令，
      模型回答末尾追加摘要/标题 JSON 块，stream_manager 解析后写 DB。
    inject_meta=True (default): append the META instruction to the context;
      the model appends a summary/title JSON block that stream_manager parses and writes to the DB.

    inject_meta=False：用于搜索等无状态场景，不注入 META 指令。
    inject_meta=False: for stateless scenarios like search; META instruction is not injected.
    """
    full_messages = list(messages)

    if inject_meta:
        # 构造 META 指令：格式说明与 JSON 模板分离，避免模型把说明文字当摘要值输出
        # Build the META instruction: keep format rules separate from the JSON template
        # so models don't echo the instruction text as the summary value.
        summary_rules = (
            f"内部摘要规则（仅用于下方 JSON，不得出现在正文回答中）："
            f"按话题分组，每条格式为 [Topic: 话题名] + 关键事实/结论/细节；"
            f"话题数量不限，已有话题严格复用原标签；语言与用户一致；总长 ≤ {summary_budget} 字。"
        )
        json_template = '"summary": "<按上述规则生成的实际摘要>"'
        if need_title:
            json_template += ', "title": "<6-12 个汉字的对话标题>"'
        full_messages.append({
            "role": "system",
            "content": (
                f"{summary_rules}\n\n"
                "重要：正文回答必须使用自然语言，禁止在正文中使用 [Topic:] 格式。\n\n"
                "完成正文回答后，必须在末尾紧接输出以下 JSON（用真实内容替换尖括号占位符，不要输出其他文字）：\n"
                f"{META_SENTINEL}\n"
                f"{{{json_template}}}"
            ),
        })

    response = await router.acompletion(
        model=model_type,
        messages=full_messages,
        stream=True,
        timeout=30,
    )

    async def _raw_deltas() -> AsyncGenerator[str, None]:
        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async for text in _strip_think_tags(_raw_deltas()):
        yield text


async def _summarizer_call(
    messages: list[dict],
    max_tokens: int,
    timeout: int = 20,
) -> str:
    """
    非流式轻量调用，使用 summarizer 分组，节省 chat RPD 额度。
    Non-streaming lightweight call using the summarizer group to preserve chat RPD quota.
    """
    response = await router.acompletion(
        model="summarizer",
        messages=messages,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    return response.choices[0].message.content.strip()


async def generate_title_and_suggestions(
    anchor_text: str,
    context_summary: str = "",
) -> tuple[str, list[str]]:
    """
    一次调用同时生成子线程标题（4-8 字）和 3 个建议追问。
    Generate a sub-thread title (4-8 characters) and 3 suggested follow-up questions in one call.

    使用 summarizer 梯队，不占用 chat RPD 额度。
    Uses the summarizer tier; does not consume chat RPD quota.
    """
    import re
    bg = f"\n\n【锚点所在的完整消息】\n{context_summary}" if context_summary else ""
    raw = await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                f"用户在阅读 AI 回复时，选中了其中这段文字作为追问锚点：\n\"{anchor_text}\"\n"
                f"请结合锚点在原文中的上下文语境，生成标题和深度追问。{bg}\n\n"
                "请严格按以下格式输出，不要输出其他任何内容：\n"
                "TITLE: <4-8 个字的小标题，直接描述锚点核心概念>\n"
                "Q1: <结合上下文，针对锚点最值得深挖的追问>\n"
                "Q2: <针对锚点的第二个深度追问>\n"
                "Q3: <针对锚点的第三个深度追问>"
            ),
        }],
        max_tokens=150,
        timeout=15,
    )

    title = anchor_text[:20]
    questions: list[str] = []

    # 解析结构化输出 / Parse structured output
    for line in raw.splitlines():
        line = line.strip()
        if re.match(r"(?i)^title\s*:", line):
            t = line.split(":", 1)[1].strip()
            if t:
                title = t
        elif re.match(r"^Q[123]\s*:", line):
            q = line.split(":", 1)[1].strip()
            if q:
                questions.append(q)

    # 全角冒号兜底 / Fallback for full-width colon
    if not questions:
        for m in re.finditer(r"Q[123]\s*[：:]\s*(.+)", raw):
            questions.append(m.group(1).strip())
    if not title or title == anchor_text[:20]:
        m = re.search(r"(?i)title\s*[：:]\s*(.+)", raw)
        if m:
            title = m.group(1).strip()

    # 最终兜底：生成通用问题 / Final fallback: generate generic questions
    if not questions:
        short = anchor_text[:10]
        questions = [
            f"请详细解释「{short}」",
            f"「{short}」有哪些应用场景？",
            f"「{short}」的优缺点是什么？",
        ]

    return title, questions[:3]


async def summarize(text: str, max_tokens: int) -> str:
    """
    将文本压缩为 max_tokens 以内的摘要，语言跟随原文。
    Compress text into a summary within max_tokens, matching the source language.
    """
    return await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                f"请将以下内容压缩为不超过 {max_tokens} tokens 的摘要，"
                f"按话题分组，格式：[Topic: 话题名] 关键事实和具体细节。"
                f"保留核心信息，语言与原文保持一致：\n\n{text}"
            ),
        }],
        max_tokens=max_tokens,
        timeout=30,
    )


async def merge_summary(existing_summary: str, new_exchange: str, max_tokens: int) -> str:
    """
    将一轮新对话增量合并进现有摘要，控制在 max_tokens 以内。
    Incrementally merge one new conversation round into the existing summary, within max_tokens.
    """
    return await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                f"以下是一段对话的现有摘要，以及刚发生的一轮新对话。\n"
                f"请将新对话的核心内容融入摘要，按话题分组，格式：[Topic: 话题名] 关键事实和具体细节。"
                f"已有话题严格复用原标签，不得重命名。更新后控制在 {max_tokens} tokens 以内，"
                f"语言与原文保持一致，只输出摘要本身：\n\n"
                f"【现有摘要】\n{existing_summary}\n\n"
                f"【新对话】\n{new_exchange}"
            ),
        }],
        max_tokens=max_tokens,
        timeout=30,
    )


async def assess_relevance(
    main_summary: str,
    threads: list[dict],
) -> list[dict]:
    """
    一次 LLM 调用评估各子线程与主线的相关性，返回结构化 JSON 数组。
    Assess relevance of sub-threads to the main thread in one LLM call.

    threads: [{"thread_id": str, "title": str, "summary": str}]
    Returns: [{"thread_id": str, "selected": bool, "reason": str}]
    Falls back to all-selected on any parse failure.
    """
    import re as _re

    thread_lines = "\n".join(
        f"{i + 1}. id={t['thread_id']}, 标题={t['title']}: {t['summary'][:200]}"
        for i, t in enumerate(threads)
    )

    raw = await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                "你是一个分析助手。以下是主线对话摘要，以及若干子问题的摘要。\n"
                "请判断每个子问题与主线主题的相关程度，决定是否默认选中用于合并输出。\n\n"
                f"【主线摘要】\n{main_summary}\n\n"
                f"【子问题列表】\n{thread_lines}\n\n"
                "请严格以 JSON 数组格式输出，不要输出其他任何内容：\n"
                '[{"thread_id": "...", "selected": true, "reason": "一句话说明"}]'
            ),
        }],
        max_tokens=500,
        timeout=30,
    )

    # 尝试从回复中提取 JSON 数组 / Try to extract JSON array from response
    try:
        match = _re.search(r"\[.*\]", raw, _re.DOTALL)
        if match:
            result = json.loads(match.group())
            if isinstance(result, list) and all(
                isinstance(r, dict) and "thread_id" in r and "selected" in r
                for r in result
            ):
                return result
    except (json.JSONDecodeError, KeyError, ValueError):
        pass

    # 兜底：全部选中 / Fallback: select all
    return [{"thread_id": t["thread_id"], "selected": True, "reason": ""} for t in threads]


async def merge_threads(
    threads_data: list[dict],
    main_content: str = "",
    format_type: str = "free",
    custom_prompt: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    以主线对话为主干、子线程为细节补充，合并为结构化输出，流式返回。
    Merge with main thread as the backbone and sub-threads as enriching detail; streamed.

    threads_data 格式 / threads_data format:
      [{"title": str, "anchor": str, "content": str}, ...]

    main_content: 主线对话原文（可为空）/ Main thread full text (may be empty)

    format_type:
      "free"       — 自由总结（流畅叙述）/ Free-form summary (flowing prose)
      "bullets"    — 要点列表（分主题分级）/ Bullet-point list (grouped by theme)
      "structured" — 结构化分析（问题/方案/权衡/结论）
                     Structured analysis (problem / solution / trade-offs / conclusion)
      "custom"     — 用户自定义提示词 / User-supplied custom instruction
      "transcript" — 对话原文直接输出，不经过 LLM / Raw transcript, no LLM call
    """
    if not threads_data:
        return

    # transcript：直接格式化原文输出，跳过 LLM 调用，节省 TPM 额度
    # transcript: format raw content directly, skip LLM to preserve TPM quota
    if format_type == "transcript":
        parts: list[str] = ["# 对话原文\n"]
        if main_content and main_content.strip():
            parts.append(f"## 主线对话\n\n{main_content.strip()}\n")
        for i, t in enumerate(threads_data, 1):
            title = t.get("title") or f"子问题 {i}"
            anchor = t.get("anchor", "")
            content = t.get("content", "")
            section = f"---\n\n## 子问题 {i}：{title}"
            if anchor:
                section += f"\n\n> 锚点：「{anchor}」"
            if content:
                section += f"\n\n{content.strip()}"
            parts.append(section)
        transcript_text = "\n\n".join(parts)
        # 分块 yield，保留流式体验
        # Yield in chunks to preserve the streaming UX
        chunk_size = 400
        for start in range(0, len(transcript_text), chunk_size):
            yield transcript_text[start : start + chunk_size]
        return

    FORMAT_INSTRUCTIONS = {
        "free": (
            "请以主线对话为核心脉络，用子问题的深入探索来丰富和补充细节，"
            "写一篇流畅有深度的总结报告。不要简单罗列，要将主线与子问题有机融合。"
        ),
        "bullets": (
            "请以主线对话为框架，将子问题探索的要点按主题分组补充进来，"
            "输出结构化的要点列表。每组用二级标题，要点用「- 」开头，保持简洁有力。"
        ),
        "structured": (
            "请以主线对话为基础，结合子问题的深入探索，整理为结构化分析，"
            "严格按以下四部分输出：\n"
            "## 问题与背景\n## 方案与见解\n## 权衡与对比\n## 结论与行动\n"
            "每部分下可分条阐述，主线提供主干，子问题提供细节支撑。"
        ),
    }

    if format_type == "custom" and custom_prompt and custom_prompt.strip():
        instruction = custom_prompt.strip()
    else:
        instruction = FORMAT_INSTRUCTIONS.get(format_type, FORMAT_INSTRUCTIONS["free"])

    # 主线内容段落 / Main thread section
    main_section = ""
    if main_content and main_content.strip():
        main_section = f"## 主线对话\n\n{main_content}\n\n"

    # 子线程内容段落 / Sub-thread sections
    sub_sections = []
    for i, t in enumerate(threads_data, 1):
        title = t.get("title") or f"子问题 {i}"
        anchor = t.get("anchor", "")
        content = t.get("content", "")
        section = f"### 子问题 {i}：{title}"
        if anchor:
            section += f"\n> 锚点：「{anchor}」"
        if content:
            section += f"\n\n{content}"
        sub_sections.append(section)

    sub_text = "\n\n---\n\n".join(sub_sections)
    sub_section = f"## 子问题探索\n\n{sub_text}" if sub_text else ""

    user_content = "以下是用户的对话内容，请按要求整合输出：\n\n"
    if main_section:
        user_content += main_section
    if sub_section:
        user_content += sub_section

    # 安全网截断：merge 组最小 TPM 10K，系统消息约 200 tokens，输出预留 1K
    # Safety net: merge group min TPM is 10K; reserve ~200 tokens for system + ~1K for output
    _HARD_CAP_CHARS = 17_000  # ~8500 tokens at 2 chars/token (well within 10K TPM)
    if len(user_content) > _HARD_CAP_CHARS:
        user_content = user_content[:_HARD_CAP_CHARS] + "\n\n…（内容过长，已截断）"

    messages = [
        {
            "role": "system",
            "content": (
                "你是一位帮助用户整合思考成果的助手。"
                "用户在对话过程中对多个要点插针展开了深入探索。"
                "主线对话是主干，子问题是对主线细节的深入挖掘，"
                "请以主线为核心将所有内容整合为有价值的输出。\n\n"
                + instruction
            ),
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]

    # 使用 merge 模型组（TPM ≥ 10K），避免大请求被小 TPM 模型拒绝
    # Use the merge model group (TPM ≥ 10K) to avoid large requests being rejected by low-TPM models
    async for chunk in chat_stream(messages, model_type="merge", inject_meta=False):
        yield chunk


async def classify_search_intent(query: str) -> bool:
    """
    判断用户问题是否需要联网搜索。触发条件：
      1. 用户明确要求联网搜索（"上网查"、"search for" 等）
      2. 问题涉及实时/近期数据（股价、天气、新闻等）
      3. 涉及 AI 可能不了解的人物、事件或网页内容
    Determine whether the user's question warrants a web search.

    使用 summarizer 梯队，节省 chat RPD。
    Uses the summarizer tier to preserve chat RPD quota.

    任何异常记录警告并返回 False，不阻断主对话。
    Any exception logs a warning and returns False; must not block the main conversation.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    _messages = [
        {
            "role": "system",
            "content": "You are a binary classifier. Reply with only YES or NO, nothing else.",
        },
        {
            "role": "user",
            "content": (
                "Should this question trigger an internet search? Answer YES if any of these apply:\n"
                "- The user explicitly asks to search / look up / go online\n"
                "- The question needs real-time data (prices, weather, live scores, current news)\n"
                "- The question is about a specific person, company, or event the AI may not know\n"
                "- The question asks for the 'latest' or 'most recent' information\n"
                "Otherwise answer NO.\n\n"
                f"Question: {query}"
            ),
        },
    ]

    def _parse(raw: str) -> bool:
        first = raw.strip().split()[0].upper().rstrip(".,!?") if raw.strip() else ""
        return first == "YES"

    # 先用 summarizer；若失败（RPD 耗尽、429 等）降级到 chat 模型重试一次
    # Try summarizer first; fall back to chat if it fails (RPD exhausted, 429, etc.)
    try:
        result = await _summarizer_call(_messages, max_tokens=5, timeout=8)
        decision = _parse(result)
        _log.info("search_intent[summarizer]: query=%r → raw=%r decision=%s", query[:60], result[:20], decision)
        return decision
    except Exception as exc:
        _log.warning("search_intent summarizer failed (query=%r): %s — retrying with chat", query[:60], exc)

    try:
        response = await router.acompletion(
            model="chat",
            messages=_messages,
            max_tokens=5,
            timeout=8,
        )
        result = (response.choices[0].message.content or "").strip()
        decision = _parse(result)
        _log.info("search_intent[chat]: query=%r → raw=%r decision=%s", query[:60], result[:20], decision)
        return decision
    except Exception as exc:
        _log.warning("search_intent chat fallback also failed (query=%r): %s", query[:60], exc)
        return False


async def vision_chat(messages: list[dict]) -> str:
    """
    图片理解，使用 vision 分组（llama-4-scout）。
    Image understanding using the vision group (llama-4-scout).
    """
    response = await router.acompletion(
        model="vision",
        messages=messages,
        timeout=30,
    )
    return response.choices[0].message.content


async def transcribe(audio_file) -> str:
    """
    语音转文字，走 Groq 原生 API（whisper-large-v3-turbo）。
    Speech-to-text via the native Groq API (whisper-large-v3-turbo).

    随机选取一个 key，避免单 key 频率限制。
    Randomly selects one key to avoid single-key rate limits.
    """
    if not GROQ_API_KEYS:
        raise RuntimeError("GROQ_API_KEYS 未配置，无法转录语音 / GROQ_API_KEYS not configured; cannot transcribe")
    from groq import Groq
    client = Groq(api_key=random.choice(GROQ_API_KEYS))
    transcription = client.audio.transcriptions.create(
        file=audio_file,
        model="whisper-large-v3-turbo",
    )
    return transcription.text
