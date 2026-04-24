# backend/services/llm_client.py
"""
SmartRouter — 多 Provider 智能路由，用量追踪 + 主动选择 + 恢复预测
SmartRouter — Multi-provider intelligent routing with usage tracking,
proactive selection, and soonest-recovery fallback.

Provider 支持 / Provider support:
  Groq, Cerebras, SambaNova, Gemini, OpenRouter — 全部免费 tier 叠加
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
from datetime import datetime, timedelta, date
from typing import AsyncGenerator
from zoneinfo import ZoneInfo

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
OPENROUTER_API_KEYS: list[str] = _load_keys("OPENROUTER_API_KEYS")


# ═══════════════════════════════════════════════════════════════════════
# Output-language directive (shared by every LLM call)
# ═══════════════════════════════════════════════════════════════════════
#
# Single source of truth: the user's UI locale (passed in as `lang`). Every
# prompt builder prepends `_lang_directive(lang)` so the model is pinned to
# one output language regardless of whatever languages appear in prior
# context. We pair a short line in the target language (strong signal for
# small models) with an English MUST-directive (strong signal for larger
# chat models), which together cover both ends of the free-tier lineup.

_LANG_NAMES: dict[str, str] = {
    "en": "English",
    "zh": "Simplified Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ru": "Russian",
}

# One-liner written in the target language itself — this single in-language
# demonstration is the most reliable way to flip a small summarizer model
# off its default Chinese/English output.
_LANG_DEMOS: dict[str, str] = {
    "en": "Always respond in English.",
    "zh": "请始终使用简体中文回答。",
    "ja": "常に日本語で回答してください。",
    "ko": "항상 한국어로 답변하세요.",
    "es": "Responde siempre en español.",
    "fr": "Répondez toujours en français.",
    "de": "Antworte immer auf Deutsch.",
    "pt": "Responda sempre em português.",
    "ru": "Всегда отвечайте на русском языке.",
}


def _lang_directive(lang: str | None) -> str:
    """Return the language directive block to prepend to any LLM system prompt.

    Falls back to English for unknown or missing locales so callers never need
    to guard the parameter themselves.
    """
    key = lang if lang in _LANG_NAMES else "en"
    return (
        f"{_LANG_DEMOS[key]}\n"
        f"Your entire response MUST be written in {_LANG_NAMES[key]}. "
        "Ignore any other language that appears in prior context."
    )


# ═══════════════════════════════════════════════════════════════════════
# 模型配置 / Model configuration
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class ModelSpec:
    """一个模型的规格定义 / Specification for a single model."""
    provider: str        # "groq", "cerebras", "sambanova", "gemini", "openrouter"
    model_id: str        # provider 内模型名
    rpm: int = 30        # 每分钟请求数 / requests per minute
    tpm: int = 6000      # 每分钟 token 数 / tokens per minute
    rpd: int = 1000      # 每天请求数 / requests per day
    tpd: int = 500_000   # 每天 token 数 / tokens per day
    groups: list[str] = field(default_factory=list)  # 所属分组
    # 日限额重置时区（00:00 为界）/ Timezone whose 00:00 boundary resets daily counters.
    # Groq / Cerebras / SambaNova / OpenRouter → "UTC"；Gemini → "America/Los_Angeles"
    reset_tz: str = "UTC"

# Groq free tier (verified 2026-04-23 via console.groq.com/docs/rate-limits):
# per-model RPM / RPD / TPM / TPD differ. gpt-oss-* and llama-4-scout each
# have distinct TPD caps; llama-3.1-8b-instant is the only 14.4K RPD model
# in the set. gpt-oss-20b / gpt-oss-120b are reasoning models that burn
# budget on chain-of-thought before emitting content, so they stay out of
# the summarizer group (tight max_tokens would leave no room for output).
GROQ_MODELS = [
    ModelSpec("groq", "llama-3.3-70b-versatile",                    rpm=30, tpm=12000,  rpd=1000,  tpd=100_000,   groups=["chat", "merge"]),
    ModelSpec("groq", "meta-llama/llama-4-scout-17b-16e-instruct",  rpm=30, tpm=30000,  rpd=1000,  tpd=500_000,   groups=["chat", "merge", "vision"]),
    ModelSpec("groq", "qwen/qwen3-32b",                             rpm=60, tpm=6000,   rpd=1000,  tpd=500_000,   groups=["chat"]),
    ModelSpec("groq", "openai/gpt-oss-120b",                        rpm=30, tpm=8000,   rpd=1000,  tpd=200_000,   groups=["chat"]),
    ModelSpec("groq", "openai/gpt-oss-20b",                         rpm=30, tpm=8000,   rpd=1000,  tpd=200_000,   groups=["chat"]),
    ModelSpec("groq", "llama-3.1-8b-instant",                       rpm=30, tpm=6000,   rpd=14400, tpd=500_000,   groups=["summarizer"]),
]

# Cerebras free tier (verified 2026-04-23 by hitting /chat/completions from
# each of our 3 keys and reading x-ratelimit-* response headers):
#   qwen-3-235b-a22b-instruct-2507: 30 RPM / 14.4K RPD / 60K TPM / 1M TPD
#   llama3.1-8b:                    30 RPM / 14.4K RPD / 60K TPM / 1M TPD
# gpt-oss-120b and zai-glm-4.7 both appear in /v1/models but return 404
# "Model ... does not exist or you do not have access to it" on every one
# of our free-tier keys — they're gated to paid plans, so they're not
# added here even though the blog post announced "free-tier availability"
# (that seems to be paid-only in practice as of 2026-04).
CEREBRAS_MODELS = [
    ModelSpec("cerebras", "qwen-3-235b-a22b-instruct-2507",  rpm=30, tpm=60000, rpd=14400, tpd=1_000_000, groups=["chat", "merge"]),
    ModelSpec("cerebras", "llama3.1-8b",                     rpm=30, tpm=60000, rpd=14400, tpd=1_000_000, groups=["summarizer"]),
]

# SambaNova free tier (verified 2026-04-23 via docs.sambanova.ai):
# RPM 20, RPD 20, TPD 200K per model. The previous rpd=1000 /
# tpd=20_000_000 values were 50x / 100x too optimistic, which meant
# SmartRouter kept picking SambaNova long after it had actually run out
# of budget and fallbacks quietly covered the gap.
SAMBANOVA_MODELS = [
    ModelSpec("sambanova", "Meta-Llama-3.3-70B-Instruct",           rpm=20, tpm=100000, rpd=20, tpd=200_000, groups=["chat", "merge"]),
    ModelSpec("sambanova", "Llama-4-Maverick-17B-128E-Instruct",    rpm=20, tpm=100000, rpd=20, tpd=200_000, groups=["chat", "merge"]),
    ModelSpec("sambanova", "DeepSeek-V3.2",                         rpm=20, tpm=100000, rpd=20, tpd=200_000, groups=["chat", "merge"]),
]

# Gemini free tier (verified 2026-04-23, post the Dec-2025 quota cut):
# 2.5 Flash is 10 RPM, 250 RPD, 250K TPM; Flash-Lite is 15 RPM, 1000 RPD,
# 250K TPM. Both reset at Pacific Time 00:00, not UTC. 2.5 Pro is
# paid-tier only and deliberately not added.
# Note: the failure mode we see most with Gemini is 503 "high demand"
# (upstream capacity, not rate limit); rpd/rpm can't prevent those, only
# SmartRouter fallback / score weighting can.
GEMINI_MODELS = [
    ModelSpec("gemini", "gemini-2.5-flash",      rpm=10, tpm=250000, rpd=250,  tpd=50_000_000, groups=["chat", "merge", "vision"], reset_tz="America/Los_Angeles"),
    ModelSpec("gemini", "gemini-2.5-flash-lite", rpm=15, tpm=250000, rpd=1000, tpd=50_000_000, groups=["chat", "summarizer"],       reset_tz="America/Los_Angeles"),
]

# OpenRouter :free (verified 2026-04-23 via /auth/key → "is_free_tier:
# true", so we're on the no-credits plan):
#   20 RPM, 50 RPD per free model (bumps to 1000 RPD once the account
#   purchases $10+ of credits — bump the rpd here when that happens,
#   SmartRouter only uses it to score remaining budget).
# 10K TPM / 2M TPD are our own conservative estimates — OpenRouter
# doesn't publish per-model token caps for :free.
# hermes-3-llama-3.1-405b:free was producing repeated 429s in the daily
# check with no behavioural advantage, so it's replaced by
# qwen/qwen3-next-80b-a3b-instruct:free (Instruct variant, 262K context,
# RULER long-context 91.8%).
# Skipped adding nvidia/nemotron-nano-12b-v2-vl:free despite being the
# only :free vision option — live probe showed content=null, with the
# whole response in the `reasoning` field, which our stream manager
# doesn't surface. Until we plumb reasoning-field support, it would
# behave as an empty-reply model in prod.
OPENROUTER_MODELS = [
    ModelSpec("openrouter", "nvidia/nemotron-3-super-120b-a12b:free",       rpm=20, tpm=10000, rpd=50, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "openai/gpt-oss-120b:free",                     rpm=20, tpm=10000, rpd=50, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "meta-llama/llama-3.3-70b-instruct:free",       rpm=20, tpm=10000, rpd=50, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "qwen/qwen3-next-80b-a3b-instruct:free",        rpm=20, tpm=10000, rpd=50, tpd=2_000_000, groups=["chat"]),
]

ALL_MODELS = GROQ_MODELS + CEREBRAS_MODELS + SAMBANOVA_MODELS + GEMINI_MODELS + OPENROUTER_MODELS

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

    分钟窗口为滚动 60s（与 provider 端一致）；日窗口按 spec.reset_tz 的自然日边界，
    跨日时归零 —— 对齐 provider 真实的 00:00 重置时点而不是进程启动后的 86400s 漂移。
    Minute window is a rolling 60s (matches provider-side behavior);
    day window is aligned to the natural date boundary in spec.reset_tz,
    so it zeroes at provider's actual 00:00 reset, not 86400s from process start.
    """
    __slots__ = (
        "rpm_used", "tpm_used", "rpd_used", "tpd_used",
        "_minute_ts", "_day_date", "_spec",
        "_last_fail_ts", "_fail_count",
    )

    def __init__(self, spec: ModelSpec):
        now = time.monotonic()
        self._spec = spec
        self.rpm_used = 0
        self.tpm_used = 0
        self.rpd_used = 0
        self.tpd_used = 0
        self._minute_ts = now
        self._day_date: date = datetime.now(ZoneInfo(spec.reset_tz)).date()
        self._last_fail_ts = 0.0
        self._fail_count = 0

    def _maybe_reset(self):
        """重置过期的时间窗口 / Reset expired time windows."""
        now = time.monotonic()
        if now - self._minute_ts >= 60:
            self.rpm_used = 0
            self.tpm_used = 0
            self._minute_ts = now
        # 日窗口：provider 对应时区跨日 → 归零
        # Day window: zero out when provider's timezone has rolled to a new date.
        today = datetime.now(ZoneInfo(self._spec.reset_tz)).date()
        if today != self._day_date:
            self.rpd_used = 0
            self.tpd_used = 0
            self._day_date = today

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

        日维度的恢复时间 = 距 spec.reset_tz 下一个 00:00 的秒数。
        Daily recovery = seconds until next 00:00 in spec.reset_tz.
        """
        self._maybe_reset()
        waits = []
        if self.rpm_used >= spec.rpm:
            waits.append(60 - (time.monotonic() - self._minute_ts))
        if self.tpm_used >= spec.tpm:
            waits.append(60 - (time.monotonic() - self._minute_ts))
        if self.rpd_used >= spec.rpd:
            now_tz = datetime.now(ZoneInfo(spec.reset_tz))
            next_midnight = (now_tz + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            waits.append((next_midnight - now_tz).total_seconds())
        return max(0, min(waits)) if waits else 0


# ═══════════════════════════════════════════════════════════════════════
# Slot = (ModelSpec, api_key) 的运行时实例
# Slot = runtime instance of (ModelSpec, api_key)
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class Slot:
    spec: ModelSpec
    api_key: str
    usage: UsageBucket = field(init=False)

    def __post_init__(self):
        # UsageBucket 需要绑定 spec 以读取 reset_tz
        # UsageBucket needs the spec to know its reset timezone.
        self.usage = UsageBucket(self.spec)

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

                    # Prometheus: 成功记一笔 call + tokens
                    # Prometheus: record one successful call + estimated tokens
                    try:
                        from services.metrics import record_llm_call
                        record_llm_call(
                            provider=slot.spec.provider,
                            model=slot.spec.model_id,
                            key_prefix=(slot.api_key or "")[:8],
                            group=try_group,
                            tokens=est_tokens,
                        )
                    except Exception:
                        pass

                    if try_group != group:
                        _log.info("Fallback %s→%s, slot=%s", group, try_group, slot.litellm_model)

                    # 把真实使用的 provider/model 附加到 response 上，供调用方读取
                    # Attach the actual provider/model to the response for caller introspection
                    try:
                        response._smart_router_model = slot.litellm_model
                    except (AttributeError, TypeError):
                        pass

                    return response

                except Exception as exc:
                    slot.usage.record_failure()
                    try:
                        from services.metrics import (
                            classify_llm_failure,
                            record_llm_failure,
                        )
                        record_llm_failure(
                            provider=slot.spec.provider,
                            model=slot.spec.model_id,
                            key_prefix=(slot.api_key or "")[:8],
                            reason=classify_llm_failure(exc),
                        )
                    except Exception:
                        pass
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
        "openrouter": OPENROUTER_API_KEYS,
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

# 主对话末尾的 META 元数据 XML 标签。用 deeppin_meta 这种独有标识，
# 避免免费 tier 弱模型把 <<<META>>> 这类 chevron 当成 placeholder 占位符吞掉。
# Closing tag is symmetric so models naturally pair them.
# META metadata XML tag emitted at the end of each main reply. The unique
# `deeppin_meta` identifier prevents weaker free-tier models from interpreting
# chevron-wrapped sentinels (like <<<META>>>) as placeholder syntax.
META_TAG_OPEN = "<deeppin_meta>"
META_TAG_CLOSE = "</deeppin_meta>"


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


class ChatStreamResult:
    """
    流式生成结果：既是 async iterable（yield 文字 chunk），也携带模型信息。
    Streaming result: async iterable yielding text chunks, plus model metadata.
    """

    def __init__(self, gen: AsyncGenerator[str, None]):
        self._gen = gen
        self.model_used: str | None = None

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        return await self._gen.__anext__()


async def chat_stream(
    messages: list[dict],
    model_type: str = "chat",
    need_title: bool = False,
    summary_budget: int = 100,
    inject_meta: bool = True,
    lang: str | None = None,
) -> ChatStreamResult:
    """
    Main conversation streaming generator; yields one text chunk at a time.
    The model name is exposed via .model_used after the first chunk.

    `lang` is the user's UI locale and forces the output language of both
    the user-facing reply and the trailing META JSON (summary + title).
    """
    full_messages = list(messages)

    if inject_meta:
        summary_rules = (
            f"Internal summary rule (applies only to the JSON below — never in the reply body): "
            f"group by topic, one entry per topic as [Topic: <topic name>] + key facts, conclusions, and details. "
            f"Any number of topics; strictly reuse existing topic labels; keep the summary under "
            f"{summary_budget} tokens."
        )
        example_fields = '"summary": "the actual summary produced per the rule above"'
        if need_title:
            example_fields += (
                ', "title": "short conversation title, roughly 6-12 CJK chars or 20-40 latin chars"'
            )
        full_messages.append({
            "role": "system",
            "content": (
                f"{_lang_directive(lang)}\n\n"
                f"{summary_rules}\n\n"
                "Important: the reply body must be natural prose — do NOT use the [Topic:] format there.\n\n"
                f"After finishing the reply body, append the following XML metadata tag "
                f"(emit the full {META_TAG_OPEN} opening and {META_TAG_CLOSE} closing tags verbatim, "
                f"with nothing outside them):\n"
                f"{META_TAG_OPEN}{{{example_fields}}}{META_TAG_CLOSE}"
            ),
        })

    response = await router.completion(
        group=model_type,
        messages=full_messages,
        stream=True,
        # 流式 timeout 实际约束 TTFT 和 chunk 间隔（非总时长）。8s 足够覆盖
        # 健康 provider 冷启动，同时在首字节卡住时及时 fallback，避免用户等 30s。
        # For streams this bounds TTFT and inter-chunk gap (not total duration). 8s covers
        # healthy cold starts while failing fast on stalled slots so fallback kicks in quickly.
        timeout=8,
    )

    result = ChatStreamResult.__new__(ChatStreamResult)
    # 优先用 SmartRouter 附加的 provider/model（含前缀），其次回退到 LiteLLM 返回的 chunk.model
    # Prefer SmartRouter's attached provider/model (with prefix), fall back to LiteLLM's chunk.model
    result.model_used = getattr(response, "_smart_router_model", None)

    async def _raw_deltas() -> AsyncGenerator[str, None]:
        async for chunk in response:
            if result.model_used is None:
                result.model_used = getattr(chunk, "model", None)
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def _wrapped() -> AsyncGenerator[str, None]:
        async for text in _strip_think_tags(_raw_deltas()):
            yield text

    result._gen = _wrapped()
    return result


async def _summarizer_call(
    messages: list[dict],
    max_tokens: int,
    timeout: int = 12,
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
    lang: str | None = None,
) -> tuple[str, list[str]]:
    """
    Generate a sub-thread title and 3 suggested follow-up questions in one call.
    Title + questions are written in the UI locale `lang` (default English).
    """
    import re
    bg = f"\n\n[Full message containing the anchor]\n{context_summary}" if context_summary else ""
    raw = await _summarizer_call(
        messages=[
            {"role": "system", "content": _lang_directive(lang)},
            {
                "role": "user",
                "content": (
                    f'While reading an AI reply, the user selected this span as an anchor for a follow-up:\n"{anchor_text}"\n'
                    f"Using the anchor's surrounding context, produce a short title and deep follow-up questions.{bg}\n\n"
                    "Output exactly in the format below and nothing else:\n"
                    "TITLE: <a short title (about 4-8 words, or 4-8 CJK characters) naming the anchor's core idea>\n"
                    "Q1: <the most worthwhile deep follow-up about the anchor, informed by context>\n"
                    "Q2: <a second deep follow-up about the anchor>\n"
                    "Q3: <a third deep follow-up about the anchor>"
                ),
            },
        ],
        max_tokens=200,
        timeout=10,
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

    # On parse failure, return an empty list; the frontend renders a localized placeholder.
    return title, questions[:3]


async def summarize(text: str, max_tokens: int, lang: str | None = None) -> str:
    """Compress text into a summary within max_tokens, written in the UI locale."""
    return await _summarizer_call(
        messages=[
            {"role": "system", "content": _lang_directive(lang)},
            {
                "role": "user",
                "content": (
                    f"Compress the following content into a summary under {max_tokens} tokens. "
                    f"Group by topic, one line each: [Topic: <topic name>] key facts and concrete details. "
                    f"Keep the core information:\n\n{text}"
                ),
            },
        ],
        max_tokens=max_tokens,
        timeout=15,
    )


async def merge_summary(
    existing_summary: str,
    new_exchange: str,
    max_tokens: int,
    lang: str | None = None,
) -> str:
    """Incrementally merge one new conversation round into the existing summary."""
    return await _summarizer_call(
        messages=[
            {"role": "system", "content": _lang_directive(lang)},
            {
                "role": "user",
                "content": (
                    "Below is an existing summary of a conversation, followed by one new round that just happened.\n"
                    "Merge the key content of the new round into the summary. "
                    "Group by topic, one line each: [Topic: <topic name>] key facts and concrete details. "
                    "Strictly reuse existing topic labels — do not rename them. "
                    f"Keep the updated summary under {max_tokens} tokens. Output only the summary itself:\n\n"
                    f"[Existing summary]\n{existing_summary}\n\n"
                    f"[New round]\n{new_exchange}"
                ),
            },
        ],
        max_tokens=max_tokens,
        timeout=15,
    )


async def assess_relevance(
    main_summary: str,
    threads: list[dict],
    lang: str | None = None,
) -> list[dict]:
    """Assess relevance of sub-threads to the main thread in one LLM call."""
    import re as _re

    thread_lines = "\n".join(
        f"{i + 1}. id={t['thread_id']}, title={t['title']}: {t['summary'][:200]}"
        for i, t in enumerate(threads)
    )

    raw = await _summarizer_call(
        messages=[
            {"role": "system", "content": _lang_directive(lang)},
            {
                "role": "user",
                "content": (
                    "You are an analysis assistant. Below are the main thread summary and several sub-question summaries.\n"
                    "For each sub-question, decide whether it is relevant enough to the main topic to be selected by default for merged output.\n\n"
                    f"[Main summary]\n{main_summary}\n\n"
                    f"[Sub-questions]\n{thread_lines}\n\n"
                    'Output strictly as a JSON array and nothing else:\n'
                    '[{"thread_id": "...", "selected": true, "reason": "one short sentence"}]'
                ),
            },
        ],
        max_tokens=500,
        timeout=15,
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


# Transcript-mode structural labels per-locale (concatenated directly, no LLM involvement).
_TRANSCRIPT_LABELS: dict[str, dict[str, str]] = {
    "en": {"title": "Conversation transcript", "main": "Main thread", "sub": "Sub-question", "anchor": "Anchor"},
    "zh": {"title": "对话原文", "main": "主线对话", "sub": "子问题", "anchor": "锚点"},
    "ja": {"title": "会話の原文", "main": "メインの会話", "sub": "サブ質問", "anchor": "アンカー"},
    "ko": {"title": "대화 원문", "main": "메인 대화", "sub": "하위 질문", "anchor": "앵커"},
    "es": {"title": "Transcripción de la conversación", "main": "Conversación principal", "sub": "Subpregunta", "anchor": "Ancla"},
    "fr": {"title": "Transcription de la conversation", "main": "Conversation principale", "sub": "Sous-question", "anchor": "Ancre"},
    "de": {"title": "Gesprächsprotokoll", "main": "Hauptunterhaltung", "sub": "Unterfrage", "anchor": "Anker"},
    "pt": {"title": "Transcrição da conversa", "main": "Conversa principal", "sub": "Subpergunta", "anchor": "Âncora"},
    "ru": {"title": "Транскрипт беседы", "main": "Основная беседа", "sub": "Подвопрос", "anchor": "Якорь"},
}


async def merge_threads(
    threads_data: list[dict],
    main_content: str = "",
    format_type: str = "free",
    custom_prompt: str | None = None,
    lang: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    以主线对话为主干、子线程为细节补充，合并为结构化输出，流式返回。
    `lang` 为用户当前 UI 语种，用于强制输出语种与 transcript 模式的结构标签。
    Merge with main thread as backbone and sub-threads as enriching detail; streamed.
    `lang` is the current UI locale and forces both output language and transcript-mode labels.
    """
    if not threads_data:
        return

    labels = _TRANSCRIPT_LABELS.get(lang or "en", _TRANSCRIPT_LABELS["en"])

    if format_type == "transcript":
        parts: list[str] = [f"# {labels['title']}\n"]
        if main_content and main_content.strip():
            parts.append(f"## {labels['main']}\n\n{main_content.strip()}\n")
        for i, t in enumerate(threads_data, 1):
            title = t.get("title") or f"{labels['sub']} {i}"
            anchor = t.get("anchor", "")
            content = t.get("content", "")
            section = f"---\n\n## {labels['sub']} {i}: {title}"
            if anchor:
                section += f"\n\n> {labels['anchor']}: \"{anchor}\""
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
            "Write a flowing, in-depth summary report. Use the main thread as the narrative spine "
            "and weave the sub-question explorations into it as enriching detail. Do not simply list — "
            "integrate main and sub-threads organically."
        ),
        "bullets": (
            "Use the main thread as the frame and group the key points from sub-question exploration "
            "by topic. Output a structured bulleted list: one level-2 heading per group, bullets starting "
            'with "- ", concise and sharp.'
        ),
        "structured": (
            "Use the main thread as the base and the sub-question exploration as detail. Output a "
            "structured analysis following exactly these four sections (translate the headings into the "
            "target output language):\n"
            "## Problem & context\n## Approach & insights\n## Trade-offs & comparisons\n## Conclusion & actions\n"
            "Each section may contain multiple points; main thread provides the backbone, sub-questions provide support."
        ),
    }

    if format_type == "custom" and custom_prompt and custom_prompt.strip():
        instruction = custom_prompt.strip()
    else:
        instruction = FORMAT_INSTRUCTIONS.get(format_type, FORMAT_INSTRUCTIONS["free"])

    main_section = ""
    if main_content and main_content.strip():
        main_section = f"## Main thread\n\n{main_content}\n\n"

    sub_sections = []
    for i, t in enumerate(threads_data, 1):
        title = t.get("title") or f"Sub-question {i}"
        anchor = t.get("anchor", "")
        content = t.get("content", "")
        section = f"### Sub-question {i}: {title}"
        if anchor:
            section += f'\n> Anchor: "{anchor}"'
        if content:
            section += f"\n\n{content}"
        sub_sections.append(section)

    sub_text = "\n\n---\n\n".join(sub_sections)
    sub_section = f"## Sub-question exploration\n\n{sub_text}" if sub_text else ""

    user_content = "The following is the user's conversation content. Integrate it per the instructions:\n\n"
    if main_section:
        user_content += main_section
    if sub_section:
        user_content += sub_section

    _HARD_CAP_CHARS = 17_000
    if len(user_content) > _HARD_CAP_CHARS:
        user_content = user_content[:_HARD_CAP_CHARS] + "\n\n…(content truncated)"

    messages = [
        {
            "role": "system",
            "content": (
                f"{_lang_directive(lang)}\n\n"
                "You are an assistant that helps users consolidate the results of their thinking. "
                "The user pinned multiple points during the conversation to explore them in depth. "
                "The main thread is the backbone; sub-questions are deep dives into its details. "
                "Integrate everything into a valuable output with the main thread at the core. "
                "Translate any section headings above into the target output language as needed.\n\n"
                + instruction
            ),
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]

    stream = await chat_stream(messages, model_type="merge", inject_meta=False, lang=lang)
    async for chunk in stream:
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
        timeout=20,
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
