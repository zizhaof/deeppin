# backend/services/metrics.py
"""
Prometheus metrics instrumentation.

Design:
     API layer is auto-instrumented by prometheus-fastapi-instrumentator.
     Component calls use Counter + Histogram recorded inline at call sites.
  3. LLM slot window state (rpm_used / tpd_used etc.) exposed via a custom Collector at scrape time
     LLM slot window state is exposed via a custom collector that reads SmartRouter
     at scrape time, so we don't update Gauges on every request.
     LLM call / token / failure counts are Counters incremented at record time.

All metric names follow Prometheus conventions (<component>_<action>_<unit>_total).
"""
from __future__ import annotations

from prometheus_client import Counter, Histogram, REGISTRY
from prometheus_client.core import GaugeMetricFamily
from prometheus_client.registry import Collector


# Histogram ─────────────────────────────────────────

# Embedding (bge-m3 local inference)
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

# SearXNG search
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

# Supabase calls (split per table)
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
    "LLM call failures by reason (rate_limit / server_error / auth / timeout / network / other)",
    ["provider", "model", "key_prefix", "reason"],
)


# LLM window state: custom Collector ────────────────────────────────────

class _LLMSlotCollector(Collector):
    """
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
    Register the custom LLM slot collector once at startup; idempotent.
    """
    global _collector_registered
    if _collector_registered:
        return
    REGISTRY.register(_LLMSlotCollector())
    _collector_registered = True


# Convenience helpers ────────────────────────────────────

def record_llm_call(*, provider: str, model: str, key_prefix: str, group: str, tokens: int) -> None:
    """Call when an LLM request succeeds."""
    LLM_CALLS.labels(provider, model, key_prefix, group or "").inc()
    if tokens:
        LLM_TOKENS.labels(provider, model, key_prefix).inc(tokens)


_VALID_REASONS = frozenset(
    {"rate_limit", "server_error", "auth", "timeout", "network", "other"}
)


def classify_llm_failure(exc: BaseException) -> str:
    """
    Map an exception to a low-cardinality reason label for Prometheus aggregation.

      429      → rate_limit
      401/403  → auth
      5xx      → server_error
      TimeoutError / asyncio.TimeoutError / "timeout" in type name → timeout
      ConnectionError / "connection" in type name                 → network
    Otherwise → other
    """
    import asyncio

    status = getattr(exc, "status_code", None)
    if status == 429:
        return "rate_limit"
    if status in (401, 403):
        return "auth"
    if isinstance(status, int) and 500 <= status < 600:
        return "server_error"

    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return "timeout"
    if isinstance(exc, ConnectionError):
        return "network"

    type_name = type(exc).__name__.lower()
    if "timeout" in type_name:
        return "timeout"
    if "connect" in type_name:
        # Covers httpx.ConnectError / ConnectionError / ConnectResetError, etc.
        return "network"

    return "other"


def record_llm_failure(
    *, provider: str, model: str, key_prefix: str, reason: str
) -> None:
    """Call when an LLM request fails.

    reason must be one of _VALID_REASONS; unknown values collapse to "other"
    to keep label cardinality bounded.
    """
    if reason not in _VALID_REASONS:
        reason = "other"
    LLM_FAILURES.labels(provider, model, key_prefix, reason).inc()
