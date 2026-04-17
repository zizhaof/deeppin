# backend/services/metrics.py
"""
Prometheus 指标埋点
Prometheus metrics instrumentation.

设计 / Design:
  1. API 层（/api/**）由 prometheus-fastapi-instrumentator 自动埋点，这里不重复。
     API layer is auto-instrumented by prometheus-fastapi-instrumentator.
  2. 组件调用（embedding / searxng / supabase）走 Counter + Histogram，埋在调用现场。
     Component calls use Counter + Histogram recorded inline at call sites.
  3. LLM Slot 窗口状态（rpm_used / tpd_used 等）用自定义 Collector 在 scrape 时
     读 SmartRouter，避免在 record_request 里频繁更新 Gauge。
     LLM slot window state is exposed via a custom collector that reads SmartRouter
     at scrape time, so we don't update Gauges on every request.
  4. LLM 调用量/失败数用 Counter，在 record_request / record_failure 里累加。
     LLM call / token / failure counts are Counters incremented at record time.

所有 metric 名称遵循 Prometheus 命名约定（<component>_<action>_<unit>_total）。
All metric names follow Prometheus conventions (<component>_<action>_<unit>_total).
"""
from __future__ import annotations

from prometheus_client import Counter, Histogram, REGISTRY
from prometheus_client.core import GaugeMetricFamily
from prometheus_client.registry import Collector


# ── 组件 Counter / Histogram ─────────────────────────────────────────

# Embedding (bge-m3 本地推理)
EMBEDDING_CALLS = Counter(
    "deeppin_embedding_calls_total",
    "Number of embedding batch calls",
    ["result"],  # ok / error
)
EMBEDDING_DURATION = Histogram(
    "deeppin_embedding_duration_seconds",
    "Embedding batch duration",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
EMBEDDING_CHARS = Counter(
    "deeppin_embedding_chars_total",
    "Total characters sent for embedding",
)

# SearXNG 搜索
SEARXNG_CALLS = Counter(
    "deeppin_searxng_calls_total",
    "Number of SearXNG queries",
    ["result"],  # ok / timeout / error
)
SEARXNG_DURATION = Histogram(
    "deeppin_searxng_duration_seconds",
    "SearXNG query duration",
    buckets=(0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
)

# Supabase 调用（按 table 拆）
SUPABASE_CALLS = Counter(
    "deeppin_supabase_calls_total",
    "Number of Supabase RPC / table calls",
    ["table", "result"],  # result: ok / error
)
SUPABASE_DURATION = Histogram(
    "deeppin_supabase_duration_seconds",
    "Supabase call duration",
    ["table"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)


# ── LLM Counter ──────────────────────────────────────────────────────

LLM_CALLS = Counter(
    "deeppin_llm_calls_total",
    "Number of LLM provider calls",
    ["provider", "model", "key_prefix", "group"],
)
LLM_TOKENS = Counter(
    "deeppin_llm_tokens_total",
    "Total tokens counted against provider quota (approximation)",
    ["provider", "model", "key_prefix"],
)
LLM_FAILURES = Counter(
    "deeppin_llm_failures_total",
    "LLM call failures (429 / 5xx / router fallback)",
    ["provider", "model", "key_prefix"],
)


# ── LLM 窗口状态：自定义 Collector ────────────────────────────────────

class _LLMSlotCollector(Collector):
    """
    scrape 时读 SmartRouter.slots，导出每个 slot 的窗口 usage 与配置 limit。
    On each scrape, reads SmartRouter.slots and exports the current window usage
    and the configured limits for each slot. The current-vs-limit ratio is the
    primary signal for provider exhaustion.
    """

    _WINDOWS = (
        ("rpm", "rpm_used", "rpm", "requests this minute"),
        ("tpm", "tpm_used", "tpm", "tokens this minute"),
        ("rpd", "rpd_used", "rpd", "requests this day"),
        ("tpd", "tpd_used", "tpd", "tokens this day"),
    )

    def collect(self):
        try:
            from services.llm_client import router as llm_router
        except Exception:
            return

        used: dict[str, GaugeMetricFamily] = {}
        limit: dict[str, GaugeMetricFamily] = {}
        for short, _, _, doc in self._WINDOWS:
            used[short] = GaugeMetricFamily(
                f"deeppin_llm_{short}_used",
                f"LLM slot {doc} — current window usage",
                labels=["provider", "model", "key_prefix"],
            )
            limit[short] = GaugeMetricFamily(
                f"deeppin_llm_{short}_limit",
                f"LLM slot {doc} — configured limit",
                labels=["provider", "model", "key_prefix"],
            )

        score = GaugeMetricFamily(
            "deeppin_llm_slot_score",
            "SmartRouter scoring for slot (0=exhausted, 1=fresh)",
            labels=["provider", "model", "key_prefix"],
        )
        recovery = GaugeMetricFamily(
            "deeppin_llm_slot_recovery_seconds",
            "Seconds until slot recovers from backoff (0 = healthy)",
            labels=["provider", "model", "key_prefix"],
        )

        for slot in getattr(llm_router, "slots", []):
            key_prefix = (slot.api_key or "")[:8]
            labels = [slot.spec.provider, slot.spec.model_id, key_prefix]
            for short, usage_attr, limit_attr, _ in self._WINDOWS:
                used[short].add_metric(labels, float(getattr(slot.usage, usage_attr, 0)))
                limit[short].add_metric(labels, float(getattr(slot.spec, limit_attr, 0)))
            try:
                score.add_metric(labels, float(slot.score()))
            except Exception:
                pass
            try:
                recovery.add_metric(labels, float(slot.seconds_until_recovery()))
            except Exception:
                pass

        for short, *_ in self._WINDOWS:
            yield used[short]
            yield limit[short]
        yield score
        yield recovery


_collector_registered = False


def register_llm_collector() -> None:
    """
    启动时注册一次 LLM Slot collector。重复调用是幂等的。
    Register the custom LLM slot collector once at startup; idempotent.
    """
    global _collector_registered
    if _collector_registered:
        return
    REGISTRY.register(_LLMSlotCollector())
    _collector_registered = True


# ── 便捷封装 / Convenience helpers ────────────────────────────────────

def record_llm_call(*, provider: str, model: str, key_prefix: str, group: str, tokens: int) -> None:
    """在 LLM 成功返回时调用 / Call when an LLM request succeeds."""
    LLM_CALLS.labels(provider, model, key_prefix, group or "").inc()
    if tokens:
        LLM_TOKENS.labels(provider, model, key_prefix).inc(tokens)


def record_llm_failure(*, provider: str, model: str, key_prefix: str) -> None:
    """在 LLM 失败（429/5xx）时调用 / Call when an LLM request fails."""
    LLM_FAILURES.labels(provider, model, key_prefix).inc()
