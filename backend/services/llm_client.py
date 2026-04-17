# backend/services/llm_client.py
"""
SmartRouter — 多 Provider 智能路由，用量追踪 + 主动选择 + 恢复预测
SmartRouter — Multi-provider intelligent routing with usage tracking,
proactive selection, and soonest-recovery fallback.

Provider 支持 / Provider support:
  Groq, Cerebras, SambaNova, Gemini — 全部免费 tier 叠加
  All free tiers stacked together.

模型分组 / Model groups:
  chat       → 主对话，大模型优先
  merge      → 合并输出，需要高 TPM
  summarizer → 摘要、分类、格式化，轻量模型
  vision     → 图片理解（Groq llama-4-scout）
"""
from __future__ import annotations

import os
import json
import time
import random
import logging
from dataclasses import dataclass, field
from typing import AsyncGenerator

import litellm
from dotenv import load_dotenv

load_dotenv()

_log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# 环境变量加载 / Load environment variables
# ═══════════════════════════════════════════════════════════════════════

def _load_keys(env_var: str) -> list[str]:
    """
    从环境变量加载 API key 列表（JSON 数组或单个字符串）。
    Load API key list from env var (JSON array or single string).
    """
    raw = os.getenv(env_var, "[]")
    try:
        parsed = json.loads(raw)
        return [k for k in parsed if k] if isinstance(parsed, list) else [raw]
    except json.JSONDecodeError:
        return [raw] if raw else []


# 保留原名以兼容测试
def _load_groq_keys() -> list[str]:
    return _load_keys("GROQ_API_KEYS")


GROQ_API_KEYS: list[str] = _load_groq_keys()
CEREBRAS_API_KEYS: list[str] = _load_keys("CEREBRAS_API_KEYS")
SAMBANOVA_API_KEYS: list[str] = _load_keys("SAMBANOVA_API_KEYS")
GEMINI_API_KEYS: list[str] = _load_keys("GEMINI_API_KEYS")


# ═══════════════════════════════════════════════════════════════════════
# 模型配置 / Model configuration
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class ModelSpec:
    """一个模型的规格定义 / Specification for a single model."""
    provider: str        # "groq", "cerebras", "sambanova", "gemini"
    model_id: str        # provider 内模型名
    rpm: int = 30        # 每分钟请求数 / requests per minute
    tpm: int = 6000      # 每分钟 token 数 / tokens per minute
    rpd: int = 1000      # 每天请求数 / requests per day
    tpd: int = 500_000   # 每天 token 数 / tokens per day
    groups: list[str] = field(default_factory=list)  # 所属分组

# Groq 模型（免费 tier：30 RPM, 6K TPM, 14.4K RPD）
GROQ_MODELS = [
    ModelSpec("groq", "llama-3.3-70b-versatile",                    rpm=30, tpm=6000,  rpd=14400, tpd=500_000, groups=["chat", "merge"]),
    ModelSpec("groq", "meta-llama/llama-4-scout-17b-16e-instruct",  rpm=30, tpm=15000, rpd=14400, tpd=500_000, groups=["chat", "merge", "vision"]),
    ModelSpec("groq", "qwen/qwen3-32b",                             rpm=30, tpm=6000,  rpd=14400, tpd=500_000, groups=["chat"]),
    ModelSpec("groq", "moonshotai/kimi-k2-instruct-0905",           rpm=30, tpm=6000,  rpd=14400, tpd=500_000, groups=["chat", "merge"]),
    ModelSpec("groq", "openai/gpt-oss-120b",                        rpm=30, tpm=6000,  rpd=1000,  tpd=500_000, groups=["chat"]),
    ModelSpec("groq", "llama-3.1-8b-instant",                       rpm=30, tpm=6000,  rpd=14400, tpd=500_000, groups=["summarizer"]),
    ModelSpec("groq", "openai/gpt-oss-20b",                         rpm=30, tpm=6000,  rpd=1000,  tpd=500_000, groups=["summarizer"]),
]

# Cerebras 模型（免费 tier：30 RPM, ~1M TPD）
CEREBRAS_MODELS = [
    ModelSpec("cerebras", "llama-3.3-70b",  rpm=30, tpm=60000, rpd=1000, tpd=1_000_000, groups=["chat", "merge"]),
    ModelSpec("cerebras", "llama3.1-8b",    rpm=30, tpm=60000, rpd=1000, tpd=1_000_000, groups=["summarizer"]),
]

# SambaNova 模型（免费 tier：10-30 RPM, 20M TPD）
SAMBANOVA_MODELS = [
    ModelSpec("sambanova", "Meta-Llama-3.1-405B-Instruct",   rpm=10, tpm=100000, rpd=1000, tpd=20_000_000, groups=["chat", "merge"]),
    ModelSpec("sambanova", "Meta-Llama-3.3-70B-Instruct",    rpm=20, tpm=100000, rpd=1000, tpd=20_000_000, groups=["chat", "merge"]),
    ModelSpec("sambanova", "Meta-Llama-3.1-8B-Instruct",     rpm=30, tpm=100000, rpd=1000, tpd=20_000_000, groups=["summarizer"]),
]

# Gemini 模型（免费 tier：10-15 RPM, 250K TPM, 1K RPD）
GEMINI_MODELS = [
    ModelSpec("gemini", "gemini-2.5-flash",      rpm=10, tpm=250000, rpd=1000, tpd=50_000_000, groups=["chat", "merge"]),
    ModelSpec("gemini", "gemini-2.5-flash-lite",  rpm=15, tpm=250000, rpd=1000, tpd=50_000_000, groups=["chat", "summarizer"]),
]

ALL_MODELS = GROQ_MODELS + CEREBRAS_MODELS + SAMBANOVA_MODELS + GEMINI_MODELS

# 兼容旧代码 / Backward compatibility
CHAT_MODELS = [m.model_id for m in ALL_MODELS if "chat" in m.groups]
MERGE_MODELS = [m.model_id for m in ALL_MODELS if "merge" in m.groups]
SUMMARIZER_MODELS = [m.model_id for m in ALL_MODELS if "summarizer" in m.groups]

# Fallback 链 / Fallback chain
FALLBACK_CHAIN: dict[str, list[str]] = {
    "chat": ["summarizer"],
    "merge": ["chat", "summarizer"],
    "summarizer": ["chat"],
    "vision": [],
}


# ═══════════════════════════════════════════════════════════════════════
# 用量追踪 / Usage tracking
# ═══════════════════════════════════════════════════════════════════════

class UsageBucket:
    """
    时间窗口用量桶：按分钟追踪 RPM/TPM，按天追踪 RPD/TPD。
    Time-windowed usage bucket: tracks RPM/TPM per minute, RPD/TPD per day.
    """
    __slots__ = (
        "rpm_used", "tpm_used", "rpd_used", "tpd_used",
        "_minute_ts", "_day_ts",
        "_last_fail_ts", "_fail_count",
    )

    def __init__(self):
        now = time.monotonic()
        self.rpm_used = 0
        self.tpm_used = 0
        self.rpd_used = 0
        self.tpd_used = 0
        self._minute_ts = now
        self._day_ts = now
        self._last_fail_ts = 0.0
        self._fail_count = 0

    def _maybe_reset(self):
        """重置过期的时间窗口 / Reset expired time windows."""
        now = time.monotonic()
        if now - self._minute_ts >= 60:
            self.rpm_used = 0
            self.tpm_used = 0
            self._minute_ts = now
        if now - self._day_ts >= 86400:
            self.rpd_used = 0
            self.tpd_used = 0
            self._day_ts = now

    def record_request(self, tokens: int = 0):
        """记录一次请求 / Record a request."""
        self._maybe_reset()
        self.rpm_used += 1
        self.rpd_used += 1
        self.tpm_used += tokens
        self.tpd_used += tokens

    def record_failure(self):
        """记录一次 429/5xx 失败 / Record a rate-limit or server failure."""
        self._last_fail_ts = time.monotonic()
        self._fail_count += 1

    def record_success(self):
        """成功后重置失败计数 / Reset failure count on success."""
        self._fail_count = 0

    def score(self, spec: ModelSpec) -> float:
        """
        计算可用性得分（0-1），越高越好。0 表示已满。
        Calculate availability score (0-1); higher is better. 0 means exhausted.

        得分 = min(各维度剩余比例) / Score = min(remaining ratio across all dimensions)
        最近失败过的模型额外惩罚 / Recently failed models get an extra penalty.
        """
        self._maybe_reset()

        rpm_r = max(0, spec.rpm - self.rpm_used) / spec.rpm if spec.rpm > 0 else 0
        tpm_r = max(0, spec.tpm - self.tpm_used) / spec.tpm if spec.tpm > 0 else 0
        rpd_r = max(0, spec.rpd - self.rpd_used) / spec.rpd if spec.rpd > 0 else 0

        s = min(rpm_r, tpm_r, rpd_r)

        # 最近 60 秒内失败过，惩罚衰减
        if self._fail_count > 0 and self._last_fail_ts > 0:
            elapsed = time.monotonic() - self._last_fail_ts
            if elapsed < 60:
                penalty = 0.5 ** (elapsed / 30)  # 30 秒半衰期
                s *= (1 - penalty)

        return s

    def seconds_until_recovery(self, spec: ModelSpec) -> float:
        """
        预估恢复可用的最短等待时间（秒）。
        Estimate shortest wait until this slot becomes available again (seconds).
        """
        self._maybe_reset()
        waits = []
        if self.rpm_used >= spec.rpm:
            waits.append(60 - (time.monotonic() - self._minute_ts))
        if self.tpm_used >= spec.tpm:
            waits.append(60 - (time.monotonic() - self._minute_ts))
        if self.rpd_used >= spec.rpd:
            waits.append(86400 - (time.monotonic() - self._day_ts))
        return max(0, min(waits)) if waits else 0


# ═══════════════════════════════════════════════════════════════════════
# Slot = (ModelSpec, api_key) 的运行时实例
# Slot = runtime instance of (ModelSpec, api_key)
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class Slot:
    spec: ModelSpec
    api_key: str
    usage: UsageBucket = field(default_factory=UsageBucket)

    @property
    def litellm_model(self) -> str:
        """LiteLLM 格式的模型名 / LiteLLM-format model name."""
        return f"{self.spec.provider}/{self.spec.model_id}"

    def score(self) -> float:
        return self.usage.score(self.spec)

    def seconds_until_recovery(self) -> float:
        return self.usage.seconds_until_recovery(self.spec)


# ═══════════════════════════════════════════════════════════════════════
# SmartRouter
# ═══════════════════════════════════════════════════════════════════════

class SmartRouter:
    """
    智能路由器：基于实时用量追踪的主动模型选择。
    Smart router: proactive model selection based on real-time usage tracking.

    策略 / Strategy:
      1. 按 score 降序排列可用 slot，选最高分
      2. 如果全部 score=0（耗尽），选最快恢复的 slot 并等待
      3. 失败时自动重试下一个 slot，直到所有 slot 尝试过
      4. 当前 group 全部失败后，按 FALLBACK_CHAIN 降级到下一组
    """

    def __init__(self, models: list[ModelSpec], keys_by_provider: dict[str, list[str]]):
        self.slots: list[Slot] = []
        self._slots_by_group: dict[str, list[Slot]] = {}

        for spec in models:
            provider_keys = keys_by_provider.get(spec.provider, [])
            for key in provider_keys:
                slot = Slot(spec=spec, api_key=key)
                self.slots.append(slot)
                for group in spec.groups:
                    self._slots_by_group.setdefault(group, []).append(slot)

        _log.info(
            "SmartRouter initialized: %d slots, groups=%s",
            len(self.slots),
            {g: len(s) for g, s in self._slots_by_group.items()},
        )

    def _pick_slot(self, group: str) -> Slot | None:
        """
        从分组中选最优 slot。得分最高的优先；全为 0 则选恢复最快的。
        Pick the best slot from a group. Highest score wins; if all zero, pick soonest recovery.
        """
        slots = self._slots_by_group.get(group, [])
        if not slots:
            return None

        scored = [(s, s.score()) for s in slots]
        available = [(s, sc) for s, sc in scored if sc > 0]

        if available:
            # 加少量随机扰动避免集中打一个 / Add jitter to avoid thundering herd
            available.sort(key=lambda x: x[1] + random.uniform(0, 0.05), reverse=True)
            return available[0][0]

        # 全部耗尽，选恢复最快的 / All exhausted, pick soonest recovery
        slots_by_recovery = sorted(scored, key=lambda x: x[0].seconds_until_recovery())
        return slots_by_recovery[0][0]

    def _get_ordered_slots(self, group: str) -> list[Slot]:
        """
        返回按 score 降序排列的 slot 列表，用于重试。
        Return slots ordered by score (desc) for retry iteration.
        """
        slots = self._slots_by_group.get(group, [])
        return sorted(slots, key=lambda s: s.score(), reverse=True)

    async def completion(
        self,
        group: str,
        messages: list[dict],
        stream: bool = False,
        max_tokens: int | None = None,
        timeout: int = 30,
    ):
        """
        发起 LLM 调用，自动路由 + 重试 + fallback。
        Make an LLM call with automatic routing, retry, and fallback.
        """
        groups_to_try = [group] + FALLBACK_CHAIN.get(group, [])
        last_error = None

        for try_group in groups_to_try:
            slots = self._get_ordered_slots(try_group)
            if not slots:
                continue

            for slot in slots:
                try:
                    # 预估 token 消耗（粗估：输入 tokens ≈ 字符数 / 2）
                    est_tokens = sum(len(m.get("content", "")) for m in messages) // 2
                    slot.usage.record_request(est_tokens)

                    kwargs: dict = {
                        "model": slot.litellm_model,
                        "messages": messages,
                        "api_key": slot.api_key,
                        "stream": stream,
                        "timeout": timeout,
                    }
                    if max_tokens is not None:
                        kwargs["max_tokens"] = max_tokens

                    response = await litellm.acompletion(**kwargs)
                    slot.usage.record_success()

                    if try_group != group:
                        _log.info("Fallback %s→%s, slot=%s", group, try_group, slot.litellm_model)

                    return response

                except Exception as exc:
                    slot.usage.record_failure()
                    last_error = exc
                    status = getattr(exc, "status_code", None)
                    _log.warning(
                        "Slot failed: %s key=%.8s… status=%s err=%s",
                        slot.litellm_model, slot.api_key, status, str(exc)[:100],
                    )
                    # 429 或 5xx 继续尝试下一个 slot
                    continue

        raise last_error or RuntimeError(f"All slots exhausted for group '{group}'")

    def get_status(self) -> dict:
        """调试用：返回各 group 的 slot 状态 / Debug: return slot status per group."""
        status = {}
        for group, slots in self._slots_by_group.items():
            status[group] = [
                {
                    "model": s.litellm_model,
                    "key": s.api_key[:8] + "...",
                    "score": round(s.score(), 3),
                    "rpm_used": s.usage.rpm_used,
                    "rpd_used": s.usage.rpd_used,
                    "recovery_s": round(s.seconds_until_recovery(), 1),
                }
                for s in slots
            ]
        return status


# ═══════════════════════════════════════════════════════════════════════
# 全局 Router 实例 / Global router instance
# ═══════════════════════════════════════════════════════════════════════

def _build_router() -> SmartRouter:
    keys_by_provider = {
        "groq": GROQ_API_KEYS,
        "cerebras": CEREBRAS_API_KEYS,
        "sambanova": SAMBANOVA_API_KEYS,
        "gemini": GEMINI_API_KEYS,
    }
    return SmartRouter(ALL_MODELS, keys_by_provider)


router: SmartRouter = _build_router()


# ═══════════════════════════════════════════════════════════════════════
# 兼容旧代码的 _build_model_list（测试使用）
# Backward-compatible _build_model_list (used by tests)
# ═══════════════════════════════════════════════════════════════════════

def _build_model_list() -> list[dict]:
    """
    生成类似旧 LiteLLM Router 格式的 model_list（兼容测试）。
    Generate a model_list similar to the old LiteLLM Router format (for test compatibility).
    """
    model_list = []
    keys_map = {
        "groq": GROQ_API_KEYS,
        "cerebras": CEREBRAS_API_KEYS,
        "sambanova": SAMBANOVA_API_KEYS,
        "gemini": GEMINI_API_KEYS,
    }
    for spec in ALL_MODELS:
        for key in keys_map.get(spec.provider, []):
            for group in spec.groups:
                model_list.append({
                    "model_name": group,
                    "litellm_params": {
                        "model": f"{spec.provider}/{spec.model_id}",
                        "api_key": key,
                    },
                })
    return model_list


# ═══════════════════════════════════════════════════════════════════════
# META 块与 think 标签处理（不变）
# META block and think tag processing (unchanged)
# ═══════════════════════════════════════════════════════════════════════

META_SENTINEL = "<<<META>>>"


async def _strip_think_tags(
    raw: AsyncGenerator[str, None],
) -> AsyncGenerator[str, None]:
    """
    过滤推理模型输出的 <think>...</think> 块，避免内部推理暴露给用户。
    Strip <think>...</think> blocks emitted by reasoning models.
    """
    in_think = False
    buf = ""

    async for chunk in raw:
        buf += chunk
        while True:
            if in_think:
                end = buf.find("</think>")
                if end == -1:
                    keep = max(0, len(buf) - len("</think>") + 1)
                    buf = buf[keep:]
                    break
                else:
                    buf = buf[end + len("</think>"):]
                    in_think = False
                    buf = buf.lstrip("\n")
            else:
                start = buf.find("<think>")
                if start == -1:
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

    if buf and not in_think:
        yield buf


# ═══════════════════════════════════════════════════════════════════════
# 公共 API（签名不变）/ Public API (signatures unchanged)
# ═══════════════════════════════════════════════════════════════════════

def pick_model(model_type: str = "chat") -> str:
    """
    返回当前 model_type 的首选模型 ID（用于日志/调试）。
    Return the preferred model ID for the given model_type (for logging/debugging).
    """
    slot = router._pick_slot(model_type)
    if slot:
        return slot.litellm_model
    if model_type == "chat":
        return f"groq/{GROQ_MODELS[0].model_id}" if GROQ_MODELS else "unknown"
    return f"groq/{GROQ_MODELS[-1].model_id}" if GROQ_MODELS else "unknown"


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
    """
    full_messages = list(messages)

    if inject_meta:
        summary_rules = (
            f"内部摘要规则（仅用于下方 JSON，不得出现在正文回答中）："
            f"按话题分组，每条格式为 [Topic: 话题名] + 关键事实/结论/细节；"
            f"话题数量不限，已有话题严格复用原标签；语言与用户一致；总长 <= {summary_budget} 字。"
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

    response = await router.completion(
        group=model_type,
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
    非流式轻量调用，使用 summarizer 分组。
    Non-streaming lightweight call using the summarizer group.
    """
    response = await router.completion(
        group="summarizer",
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

    if not questions:
        for m in re.finditer(r"Q[123]\s*[：:]\s*(.+)", raw):
            questions.append(m.group(1).strip())
    if not title or title == anchor_text[:20]:
        m = re.search(r"(?i)title\s*[：:]\s*(.+)", raw)
        if m:
            title = m.group(1).strip()

    if not questions:
        short = anchor_text[:10]
        questions = [
            f"请详细解释「{short}」",
            f"「{short}」有哪些应用场景？",
            f"「{short}」的优缺点是什么？",
        ]

    return title, questions[:3]


async def summarize(text: str, max_tokens: int) -> str:
    """将文本压缩为 max_tokens 以内的摘要 / Compress text into a summary within max_tokens."""
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
    """将一轮新对话增量合并进现有摘要 / Incrementally merge one new conversation round into the existing summary."""
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
    一次 LLM 调用评估各子线程与主线的相关性。
    Assess relevance of sub-threads to the main thread in one LLM call.
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
    """
    if not threads_data:
        return

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

    main_section = ""
    if main_content and main_content.strip():
        main_section = f"## 主线对话\n\n{main_content}\n\n"

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

    _HARD_CAP_CHARS = 17_000
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

    async for chunk in chat_stream(messages, model_type="merge", inject_meta=False):
        yield chunk


async def classify_search_intent(query: str) -> bool:
    """
    判断用户问题是否需要联网搜索。
    Determine whether the user's question warrants a web search.
    """
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

    try:
        result = await _summarizer_call(_messages, max_tokens=5, timeout=8)
        decision = _parse(result)
        _log.info("search_intent[summarizer]: query=%r -> raw=%r decision=%s", query[:60], result[:20], decision)
        return decision
    except Exception as exc:
        _log.warning("search_intent summarizer failed (query=%r): %s — retrying with chat", query[:60], exc)

    try:
        response = await router.completion(
            group="chat",
            messages=_messages,
            max_tokens=5,
            timeout=8,
        )
        result = (response.choices[0].message.content or "").strip()
        decision = _parse(result)
        _log.info("search_intent[chat]: query=%r -> raw=%r decision=%s", query[:60], result[:20], decision)
        return decision
    except Exception as exc:
        _log.warning("search_intent chat fallback also failed (query=%r): %s", query[:60], exc)
        return False


async def vision_chat(messages: list[dict]) -> str:
    """图片理解，使用 vision 分组 / Image understanding using the vision group."""
    response = await router.completion(
        group="vision",
        messages=messages,
        timeout=30,
    )
    return response.choices[0].message.content


async def transcribe(audio_file) -> str:
    """
    语音转文字，走 Groq 原生 API（whisper-large-v3-turbo）。
    Speech-to-text via the native Groq API (whisper-large-v3-turbo).
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
