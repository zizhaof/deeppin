# tests/test_metrics.py
"""
Unit tests for metrics module.

Focus: classify_llm_failure exception classification logic -- this function is
Focus: classify_llm_failure's exception classification — this is what
lets Grafana dashboards slice failures by type.
"""
from __future__ import annotations

import asyncio

import pytest

from services.metrics import (
    LLM_FAILURES,
    _VALID_REASONS,
    classify_llm_failure,
    record_llm_failure,
)


class _StatusError(Exception):
    """    Exception carrying status_code, mimicking litellm / httpx HTTP errors."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class _CustomTimeoutError(Exception):
    """Type name contains 'timeout' but is not a TimeoutError subclass."""


class _CustomConnectError(Exception):
    """Type name contains 'connection' but is not a ConnectionError subclass."""


@pytest.mark.parametrize(
    "status,expected",
    [
        (429, "rate_limit"),
        (401, "auth"),
        (403, "auth"),
        (500, "server_error"),
        (502, "server_error"),
        (503, "server_error"),
        (418, "other"),   # non-standard 4xx → other
        (404, "other"),
    ],
)
def test_classify_by_status_code(status: int, expected: str) -> None:
    assert classify_llm_failure(_StatusError("boom", status)) == expected


def test_classify_timeout_builtin() -> None:
    assert classify_llm_failure(TimeoutError("slow")) == "timeout"


def test_classify_timeout_asyncio() -> None:
    assert classify_llm_failure(asyncio.TimeoutError()) == "timeout"


def test_classify_connection_builtin() -> None:
    assert classify_llm_failure(ConnectionError("refused")) == "network"


def test_classify_by_type_name_timeout() -> None:
    assert classify_llm_failure(_CustomTimeoutError()) == "timeout"


def test_classify_by_type_name_connection() -> None:
    assert classify_llm_failure(_CustomConnectError()) == "network"


def test_classify_unknown_exception_falls_back_to_other() -> None:
    assert classify_llm_failure(ValueError("wat")) == "other"


def test_classify_status_code_takes_priority_over_type() -> None:
    # status_code wins even when the type name looks like "timeout"
    class _TimeoutLikeWith429(Exception):
        status_code = 429

    assert classify_llm_failure(_TimeoutLikeWith429()) == "rate_limit"


def test_record_llm_failure_rejects_unknown_reason_and_folds_to_other() -> None:
    """    Unknown reason folds to "other" to bound Prometheus label cardinality."""
    labels = {
        "provider": "groq",
        "model": "test-model",
        "key_prefix": "testkey1",
        "reason": "wat-is-this",  # illegal value
    }
    before = LLM_FAILURES.labels(
        labels["provider"], labels["model"], labels["key_prefix"], "other"
    )._value.get()
    record_llm_failure(**labels)
    after = LLM_FAILURES.labels(
        labels["provider"], labels["model"], labels["key_prefix"], "other"
    )._value.get()
    assert after == before + 1


def test_valid_reasons_set_is_complete() -> None:
    """    _VALID_REASONS must cover every value classify_llm_failure can return."""
    observed = {
        classify_llm_failure(_StatusError("", 429)),
        classify_llm_failure(_StatusError("", 401)),
        classify_llm_failure(_StatusError("", 500)),
        classify_llm_failure(TimeoutError()),
        classify_llm_failure(ConnectionError()),
        classify_llm_failure(ValueError()),
    }
    assert observed <= _VALID_REASONS
    assert observed == {
        "rate_limit",
        "auth",
        "server_error",
        "timeout",
        "network",
        "other",
    }
