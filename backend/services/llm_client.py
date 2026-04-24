# backend/services/llm_client.py
"""
SmartRouter — Multi-provider intelligent routing with usage tracking,
proactive selection, and soonest-recovery fallback.

Provider support:
  All free tiers stacked together.

Model groups:
  chat       -> Main dialogue, prefer larger models
  merge      -> Merge output, requires high TPM
  summarizer -> Summary, classification, formatting; lightweight models
  vision     -> Image understanding (Groq llama-4-scout)
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
# Load environment variables
# ═══════════════════════════════════════════════════════════════════════

def _load_keys(env_var: str) -> list[str]:
    """
    Load API key list from env var (JSON array or single string).
    """
    raw = os.getenv(env_var, "[]")
    try:
        parsed = json.loads(raw)
        return [k for k in parsed if k] if isinstance(parsed, list) else [raw]
    except json.JSONDecodeError:
        return [raw] if raw else []


# Keep the original name for test compatibility
def _load_groq_keys() -> list[str]:
    return _load_keys("GROQ_API_KEYS")


GROQ_API_KEYS: list[str] = _load_groq_keys()
CEREBRAS_API_KEYS: list[str] = _load_keys("CEREBRAS_API_KEYS")
SAMBANOVA_API_KEYS: list[str] = _load_keys("SAMBANOVA_API_KEYS")
GEMINI_API_KEYS: list[str] = _load_keys("GEMINI_API_KEYS")
OPENROUTER_API_KEYS: list[str] = _load_keys("OPENROUTER_API_KEYS")


# ═══════════════════════════════════════════════════════════════════════
# Model configuration
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class ModelSpec:
    """Specification for a single model."""
    provider: str        # "groq", "cerebras", "sambanova", "gemini", "openrouter"
    model_id: str        # Model name within the provider
    rpm: int = 30        # requests per minute
    tpm: int = 6000      # tokens per minute
    rpd: int = 1000      # requests per day
    tpd: int = 500_000   # tokens per day
    groups: list[str] = field(default_factory=list)  # Groups this slot belongs to
    # Groq / Cerebras / SambaNova / OpenRouter → "UTC"；Gemini → "America/Los_Angeles"
    reset_tz: str = "UTC"

# 14.4K RPD）
# kimi-k2-instruct-0905 retired on 2026-04-15; gpt-oss-20b is a reasoning model and wastes TPM as a summarizer
GROQ_MODELS = [
    ModelSpec("groq", "llama-3.3-70b-versatile",                    rpm=30, tpm=6000,   rpd=14400, tpd=500_000, groups=["chat", "merge"]),
    ModelSpec("groq", "meta-llama/llama-4-scout-17b-16e-instruct",  rpm=30, tpm=15000,  rpd=14400, tpd=500_000, groups=["chat", "merge", "vision"]),
    ModelSpec("groq", "qwen/qwen3-32b",                             rpm=30, tpm=6000,   rpd=14400, tpd=500_000, groups=["chat"]),
    ModelSpec("groq", "openai/gpt-oss-120b",                        rpm=30, tpm=6000,   rpd=1000,  tpd=500_000, groups=["chat"]),
    ModelSpec("groq", "llama-3.1-8b-instant",                       rpm=30, tpm=6000,   rpd=14400, tpd=500_000, groups=["summarizer"]),
]

# 1M TPD）
# Verified working in 2026-04: llama3.1-8b + qwen-3-235b (gpt-oss-120b and zai-glm-4.7 free tier 404)
CEREBRAS_MODELS = [
    ModelSpec("cerebras", "qwen-3-235b-a22b-instruct-2507",  rpm=30, tpm=60000, rpd=14400, tpd=1_000_000, groups=["chat", "merge"]),
    ModelSpec("cerebras", "llama3.1-8b",                      rpm=30, tpm=60000, rpd=14400, tpd=1_000_000, groups=["summarizer"]),
]

# 100K TPM）
# Many models retired in 2026-04; only the following remain available
SAMBANOVA_MODELS = [
    ModelSpec("sambanova", "Meta-Llama-3.3-70B-Instruct",            rpm=20, tpm=100000, rpd=1000, tpd=20_000_000, groups=["chat", "merge"]),
    ModelSpec("sambanova", "Llama-4-Maverick-17B-128E-Instruct",     rpm=20, tpm=100000, rpd=1000, tpd=20_000_000, groups=["chat", "merge"]),
]

# 1K RPD）
# Note: Gemini daily quotas reset at Pacific Time 00:00, not UTC.
GEMINI_MODELS = [
    ModelSpec("gemini", "gemini-2.5-flash",      rpm=10, tpm=250000, rpd=1000, tpd=50_000_000, groups=["chat", "merge", "vision"], reset_tz="America/Los_Angeles"),
    ModelSpec("gemini", "gemini-2.5-flash-lite",  rpm=15, tpm=250000, rpd=1000, tpd=50_000_000, groups=["chat", "summarizer"],       reset_tz="America/Los_Angeles"),
]

# OpenRouter free models (20 RPM, 200 RPD; buying $10 credit raises to 1000 RPD)
# Model IDs carry the :free suffix; upstream provider may temporarily rate-limit
# 10K TPM is unsuitable for merge (one call burns the per-minute quota), so the merge group is removed
OPENROUTER_MODELS = [
    ModelSpec("openrouter", "nvidia/nemotron-3-super-120b-a12b:free",       rpm=20, tpm=10000, rpd=200, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "openai/gpt-oss-120b:free",                     rpm=20, tpm=10000, rpd=200, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "meta-llama/llama-3.3-70b-instruct:free",       rpm=20, tpm=10000, rpd=200, tpd=2_000_000, groups=["chat"]),
    ModelSpec("openrouter", "nousresearch/hermes-3-llama-3.1-405b:free",    rpm=20, tpm=10000, rpd=200, tpd=2_000_000, groups=["chat"]),
]

ALL_MODELS = GROQ_MODELS + CEREBRAS_MODELS + SAMBANOVA_MODELS + GEMINI_MODELS + OPENROUTER_MODELS

# Fallback chain
FALLBACK_CHAIN: dict[str, list[str]] = {
    "chat": ["summarizer"],
    "merge": ["chat", "summarizer"],
    "summarizer": ["chat"],
    "vision": [],
}


# ═══════════════════════════════════════════════════════════════════════
# Usage tracking
# ═══════════════════════════════════════════════════════════════════════

class UsageBucket:
    """
    Time-windowed usage bucket: tracks RPM/TPM per minute, RPD/TPD per day.

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
        """Reset expired time windows."""
        now = time.monotonic()
        if now - self._minute_ts >= 60:
            self.rpm_used = 0
            self.tpm_used = 0
            self._minute_ts = now
        # Day window: zero out when provider's timezone has rolled to a new date.
        today = datetime.now(ZoneInfo(self._spec.reset_tz)).date()
        if today != self._day_date:
            self.rpd_used = 0
            self.tpd_used = 0
            self._day_date = today

    def record_request(self, tokens: int = 0):
        """Record a request."""
        self._maybe_reset()
        self.rpm_used += 1
        self.rpd_used += 1
        self.tpm_used += tokens
        self.tpd_used += tokens

    def record_failure(self):
        """Record a rate-limit or server failure."""
        self._last_fail_ts = time.monotonic()
        self._fail_count += 1

    def record_success(self):
        """Reset failure count on success."""
        self._fail_count = 0

    def score(self, spec: ModelSpec) -> float:
        """
        Calculate availability score (0-1); higher is better. 0 means exhausted.

        Score = min(remaining ratio across all dimensions)
        Recently failed models get an extra penalty.
        """
        self._maybe_reset()

        rpm_r = max(0, spec.rpm - self.rpm_used) / spec.rpm if spec.rpm > 0 else 0
        tpm_r = max(0, spec.tpm - self.tpm_used) / spec.tpm if spec.tpm > 0 else 0
        rpd_r = max(0, spec.rpd - self.rpd_used) / spec.rpd if spec.rpd > 0 else 0

        s = min(rpm_r, tpm_r, rpd_r)

        # Failed within the last 60s; apply a decaying penalty
        if self._fail_count > 0 and self._last_fail_ts > 0:
            elapsed = time.monotonic() - self._last_fail_ts
            if elapsed < 60:
                penalty = 0.5 ** (elapsed / 30)  # 30s half-life
                s *= (1 - penalty)

        return s

    def seconds_until_recovery(self, spec: ModelSpec) -> float:
        """
        Estimate shortest wait until this slot becomes available again (seconds).

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
# Slot = (ModelSpec
# Slot = runtime instance of (ModelSpec, api_key)
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class Slot:
    spec: ModelSpec
    api_key: str
    usage: UsageBucket = field(init=False)

    def __post_init__(self):
        # UsageBucket needs the spec to know its reset timezone.
        self.usage = UsageBucket(self.spec)

    @property
    def litellm_model(self) -> str:
        """LiteLLM-format model name."""
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
    Smart router: proactive model selection based on real-time usage tracking.

    Strategy:
      1. Sort available slots by score descending and pick the top one
      2. If all scores are 0 (exhausted), pick the slot recovering soonest and wait
      3. On failure, automatically retry the next slot until all slots are tried
      4. After all slots in the current group fail, fall back to the next group via FALLBACK_CHAIN
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
        Pick the best slot from a group. Highest score wins; if all zero, pick soonest recovery.
        """
        slots = self._slots_by_group.get(group, [])
        if not slots:
            return None

        scored = [(s, s.score()) for s in slots]
        available = [(s, sc) for s, sc in scored if sc > 0]

        if available:
            # Add jitter to avoid thundering herd
            available.sort(key=lambda x: x[1] + random.uniform(0, 0.05), reverse=True)
            return available[0][0]

        # All exhausted, pick soonest recovery
        slots_by_recovery = sorted(scored, key=lambda x: x[0].seconds_until_recovery())
        return slots_by_recovery[0][0]

    def _get_ordered_slots(self, group: str) -> list[Slot]:
        """
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
                    # Estimate token usage (rough: input tokens ~= chars / 2)
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
                    # 429 or 5xx: continue trying the next slot
                    continue

        raise last_error or RuntimeError(f"All slots exhausted for group '{group}'")

    def get_status(self) -> dict:
        """Debug: return slot status per group."""
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
# Global router instance
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
# Backward-compatible _build_model_list (used by tests)
# ═══════════════════════════════════════════════════════════════════════

def _build_model_list() -> list[dict]:
    """
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
# META block and think tag processing (unchanged)
# ═══════════════════════════════════════════════════════════════════════

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
# Public API (signatures unchanged)
# ═══════════════════════════════════════════════════════════════════════

def pick_model(model_type: str = "chat") -> str:
    """
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
) -> ChatStreamResult:
    """
    Main conversation streaming generator; yields one text chunk at a time.
    The model name is exposed via .model_used after the first chunk.
    """
    full_messages = list(messages)

    if inject_meta:
        # Language rule (highest priority): follow the user's most recent message's language,
        # unless that message explicitly requests a different language.
        language_rule = (
            "Language rule (highest priority): Reply in the same language as the user's "
            "most recent message. If that message explicitly requests a different language "
            '(e.g. "please answer in English", "用中文回答"), follow the explicit request '
            "instead. Do not be influenced by earlier turns' language."
        )
        summary_rules = (
            f"内部摘要规则（仅用于下方 JSON，不得出现在正文回答中）："
            f"按话题分组，每条格式为 [Topic: 话题名] + 关键事实/结论/细节；"
            f"话题数量不限，已有话题严格复用原标签；语言与用户一致；总长 <= {summary_budget} 字。"
        )
        example_fields = '"summary": "按上述规则生成的实际摘要"'
        if need_title:
            # Title language follows the user; length ≈ 6–12 Chinese chars (≈ 20–40 latin chars)
            example_fields += (
                ', "title": "conversation title in the same language as the user, '
                'roughly 6-12 Chinese chars or 20-40 latin chars"'
            )
        full_messages.append({
            "role": "system",
            "content": (
                f"{language_rule}\n\n"
                f"{summary_rules}\n\n"
                "重要：正文回答必须使用自然语言，禁止在正文中使用 [Topic:] 格式。\n\n"
                f"完成正文回答后，紧接输出以下 XML 元数据标签（包括完整的 {META_TAG_OPEN} "
                f"起始标签和 {META_TAG_CLOSE} 结束标签，标签名一字不漏，标签外不要输出任何字符）：\n"
                f"{META_TAG_OPEN}{{{example_fields}}}{META_TAG_CLOSE}"
            ),
        })

    response = await router.completion(
        group=model_type,
        messages=full_messages,
        stream=True,
        # For streams this bounds TTFT and inter-chunk gap (not total duration). 8s covers
        # healthy cold starts while failing fast on stalled slots so fallback kicks in quickly.
        timeout=8,
    )

    result = ChatStreamResult.__new__(ChatStreamResult)
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
    Generate a sub-thread title and 3 suggested follow-up questions in one call.
    Title + questions follow the anchor text's language; no hard-coded Chinese.
    """
    import re
    bg = f"\n\n[Full message containing the anchor]\n{context_summary}" if context_summary else ""
    raw = await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                f'While reading an AI reply, the user selected this span as an anchor for a follow-up:\n"{anchor_text}"\n'
                f"Using the anchor's surrounding context, produce a short title and deep follow-up questions.{bg}\n\n"
                "Language rule (highest priority): the TITLE and every Q must be written in the same "
                "language/script as the anchor text above. Do not default to English or Chinese.\n\n"
                "Output exactly in the format below and nothing else:\n"
                "TITLE: <a short title (about 4-8 words, or 4-8 CJK characters) naming the anchor's core idea>\n"
                "Q1: <the most worthwhile deep follow-up about the anchor, informed by context>\n"
                "Q2: <a second deep follow-up about the anchor>\n"
                "Q3: <a third deep follow-up about the anchor>"
            ),
        }],
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

    # On parse failure, no hard-coded Chinese fallback questions; the frontend has localized placeholders.
    return title, questions[:3]


async def summarize(text: str, max_tokens: int) -> str:
    """Compress text into a summary within max_tokens."""
    return await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                f"Compress the following content into a summary under {max_tokens} tokens. "
                f"Group by topic, one line each: [Topic: <topic name>] key facts and concrete details. "
                f"Keep the core information. Write the summary in the same language as the original text below:\n\n{text}"
            ),
        }],
        max_tokens=max_tokens,
        timeout=15,
    )


async def merge_summary(existing_summary: str, new_exchange: str, max_tokens: int) -> str:
    """Incrementally merge one new conversation round into the existing summary."""
    return await _summarizer_call(
        messages=[{
            "role": "user",
            "content": (
                "Below is an existing summary of a conversation, followed by one new round that just happened.\n"
                "Merge the key content of the new round into the summary. "
                "Group by topic, one line each: [Topic: <topic name>] key facts and concrete details. "
                "Strictly reuse existing topic labels — do not rename them. "
                f"Keep the updated summary under {max_tokens} tokens. "
                "Write in the same language as the source material, and output only the summary itself:\n\n"
                f"[Existing summary]\n{existing_summary}\n\n"
                f"[New round]\n{new_exchange}"
            ),
        }],
        max_tokens=max_tokens,
        timeout=15,
    )


# Map of supported UI locales to natural-language names used to force output language.
_MERGE_LANG_NAMES: dict[str, str] = {
    "en": "English",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "ko": "Korean",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ru": "Russian",
}

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

    # Language directive: if lang is given, force the target; otherwise follow the source.
    if lang and lang in _MERGE_LANG_NAMES:
        lang_directive = (
            f"Write the entire merged report in {_MERGE_LANG_NAMES[lang]}, including all headings and labels. "
            "Translate any section headings above into that language as needed."
        )
    else:
        lang_directive = (
            "Write the merged report in the same language as the main thread content above. "
            "Translate section headings into that language as needed."
        )

    messages = [
        {
            "role": "system",
            "content": (
                "You are an assistant that helps users consolidate the results of their thinking. "
                "The user pinned multiple points during the conversation to explore them in depth. "
                "The main thread is the backbone; sub-questions are deep dives into its details. "
                "Integrate everything into a valuable output with the main thread at the core.\n\n"
                + lang_directive + "\n\n"
                + instruction
            ),
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]

    stream = await chat_stream(messages, model_type="merge", inject_meta=False)
    async for chunk in stream:
        yield chunk


async def classify_search_intent(query: str) -> bool:
    """
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
    """Image understanding using the vision group."""
    response = await router.completion(
        group="vision",
        messages=messages,
        timeout=20,
    )
    return response.choices[0].message.content
