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

# summarizer 梯队：轻量任务（摘要、分类、格式化）
# Summarizer tier: lightweight tasks (summarization, classification, formatting)
SUMMARIZER_MODELS = [
    "llama-3.1-8b-instant",
    "openai/gpt-oss-20b",
    "allam-2-7b",
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
    构建 LiteLLM Router，配置 usage-based 路由和 chat → summarizer fallback。
    Build the LiteLLM Router with usage-based routing and chat → summarizer fallback.
    """
    model_list = _build_model_list()
    total_chat = len(GROQ_API_KEYS) * len(CHAT_MODELS)
    return Router(
        model_list=model_list,
        routing_strategy="usage-based-routing",  # 优先选剩余额度最多的 / Prefer the model with most remaining quota
        num_retries=3,
        retry_after=5,
        fallbacks=[{"chat": ["summarizer"]}],  # 所有 chat 组合耗尽才触发 / Only triggered when all chat combos are exhausted
        allowed_fails=total_chat,
    )


router: Router = _build_router()

# META 块：嵌入主对话末尾，解析出摘要和标题，省去额外 LLM 调用
# META block: appended at the end of the main reply; parsing it avoids extra LLM calls
META_SENTINEL = "<<<META>>>"


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
        # 构造 META 指令：要求模型在回答末尾输出摘要（和标题）
        # Build the META instruction: ask the model to output summary (and title) at the end of its reply
        fields = (
            f'"summary": "按话题分组记录对话内容，格式：[Topic: 话题名] 关键事实、结论、具体细节（数据/方案/观点）。'
            f'最多 5 个话题；已有话题严格复用原标签，不得重命名；预算不足时压缩语言，不删话题条目。'
            f'语言与用户保持一致。严格控制在 {summary_budget} 字以内"'
        )
        if need_title:
            fields += ', "title": "6-12 个汉字的对话标题"'
        full_messages.append({
            "role": "system",
            "content": (
                "完成回答后，必须在正文末尾（不换行说明）紧接输出：\n"
                f"{META_SENTINEL}\n"
                f"{{{fields}}}"
            ),
        })

    response = await router.acompletion(
        model=model_type,
        messages=full_messages,
        stream=True,
        timeout=30,
    )
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


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
    """
    if not threads_data:
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

    async for chunk in chat_stream(messages, inject_meta=False):
        yield chunk


async def classify_search_intent(query: str) -> bool:
    """
    判断用户问题是否需要联网搜索（新闻、实时数据、近期事件等）。
    Determine whether the user's question requires a web search (news, real-time data, recent events, etc.).

    使用 summarizer 梯队，节省 chat RPD。
    Uses the summarizer tier to preserve chat RPD quota.

    任何异常静默返回 False，不阻断主对话。
    Any exception silently returns False; must not block the main conversation.
    """
    try:
        result = await _summarizer_call(
            messages=[{
                "role": "user",
                "content": (
                    "判断这个问题是否需要搜索最新信息（新闻、实时数据、当前价格、近期事件等）。\n"
                    "只回复 YES 或 NO，不要解释。\n\n"
                    f"问题：{query}"
                ),
            }],
            max_tokens=5,
            timeout=8,
        )
        return result.strip().upper().startswith("YES")
    except Exception:
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
