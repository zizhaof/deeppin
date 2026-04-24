"""Unit tests for anon trial quota, 1-session limit, and delete gating.

Router-level gate only (injects CurrentUser via dependency_overrides). The
stream_and_save turn_count RPC increment is verified separately below.
"""
from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app_and_deps(monkeypatch):
    """Load the app and return (app, get_current_user_full) for easy override."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    import importlib
    import main as main_module
    importlib.reload(main_module)
    from dependencies.auth import CurrentUser, get_current_user_full
    return main_module.app, get_current_user_full, CurrentUser


def _override_user(app, dep, current_user):
    app.dependency_overrides[dep] = lambda: current_user


# ── 1. /chat gate ────────────────────────────────────────────────────


def test_chat_blocks_anon_at_quota(app_and_deps):
    """Anonymous + turn_count==20 -> 402 anon_quota_exceeded."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    # thread_res (maybe_single)
    thread_chain = MagicMock()
    thread_chain.data = {"id": "t1", "depth": 0, "title": None, "session_id": "s1"}
    # session_res (maybe_single)
    session_chain = MagicMock()
    session_chain.data = {"turn_count": 20}
    # The two execute calls return the above values in sequence
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.eq.return_value = sb
    sb.maybe_single.return_value = sb
    sb.execute.side_effect = [thread_chain, session_chain]

    _override_user(app, get_full, CurrentUser(user_id="anon-u", is_anonymous=True, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post(
            "/api/threads/00000000-0000-0000-0000-000000000001/chat",
            json={"content": "hi"},
        )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 402
    body = resp.json()
    assert body["detail"]["code"] == "anon_quota_exceeded"
    assert body["detail"]["limit"] == 20


def test_chat_allows_anon_below_quota(app_and_deps):
    """Anonymous + turn_count<20 -> not gated, falls through to StreamingResponse."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    thread_chain = MagicMock()
    thread_chain.data = {"id": "t1", "depth": 0, "title": None, "session_id": "s1"}
    session_chain = MagicMock()
    session_chain.data = {"turn_count": 3}
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.eq.return_value = sb
    sb.maybe_single.return_value = sb
    sb.execute.side_effect = [thread_chain, session_chain]

    _override_user(app, get_full, CurrentUser(user_id="anon-u", is_anonymous=True, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)

    # Patch stream_and_save itself to avoid actually running the LLM chain
    async def fake_stream(*args, **kwargs):
        yield 'data: {"type":"ping"}\n\n'
    try:
        with patch("routers.stream.stream_and_save", side_effect=fake_stream):
            resp = client.post(
                "/api/threads/00000000-0000-0000-0000-000000000001/chat",
                json={"content": "hi"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert "ping" in resp.text


def test_chat_signed_in_never_gated(app_and_deps):
    """Authenticated users are not gated regardless of turn_count."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    thread_chain = MagicMock()
    thread_chain.data = {"id": "t1", "depth": 0, "title": None, "session_id": "s1"}
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.eq.return_value = sb
    sb.maybe_single.return_value = sb
    # Only one query (thread_res); the session_res path is skipped because is_anonymous=False
    sb.execute.side_effect = [thread_chain]

    _override_user(app, get_full, CurrentUser(user_id="signed-u", is_anonymous=False, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)

    async def fake_stream(*args, **kwargs):
        yield 'data: {"type":"ping"}\n\n'
    try:
        with patch("routers.stream.stream_and_save", side_effect=fake_stream):
            resp = client.post(
                "/api/threads/00000000-0000-0000-0000-000000000001/chat",
                json={"content": "hi"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200


# 2. /sessions POST anonymous 1-session limit ─────────────────────────────


def test_create_session_blocks_second_anon(app_and_deps):
    """Anonymous already has 1 session -> creating another returns 402 anon_session_limit."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.limit.return_value = sb
    count_chain = MagicMock()
    count_chain.count = 1  # Already has 1 session
    sb.execute.side_effect = [count_chain]

    _override_user(app, get_full, CurrentUser(user_id="anon-u", is_anonymous=True, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post("/api/sessions", json={"title": "new"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 402
    assert resp.json()["detail"]["code"] == "anon_session_limit"


def test_create_session_first_anon_ok(app_and_deps):
    """Anonymous first session -> creation allowed."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.limit.return_value = sb
    sb.insert.return_value = sb
    sb.delete.return_value = sb
    sb.eq.return_value = sb
    # insert main thread
    sb.execute.side_effect = [
        MagicMock(count=0),  # count
        MagicMock(data=[{
            "id": "00000000-0000-0000-0000-0000000000aa",
            "title": "new",
            "created_at": "2026-04-18T00:00:00+00:00",
        }]),  # session insert
        MagicMock(data=[{"id": "00000000-0000-0000-0000-0000000000bb"}]),  # thread insert
    ]

    _override_user(app, get_full, CurrentUser(user_id="anon-u", is_anonymous=True, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.post("/api/sessions", json={"title": "new"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 201


# 3. /sessions DELETE anonymous prohibition ───────────────────────────────────────


def test_delete_session_forbidden_for_anon(app_and_deps):
    """Anonymous attempts to delete -> 403 anon_cannot_delete.
    Prevents the "delete-then-recreate" workaround for the 20-turn quota."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    _override_user(app, get_full, CurrentUser(user_id="anon-u", is_anonymous=True, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.delete("/api/sessions/00000000-0000-0000-0000-000000000001")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "anon_cannot_delete"
    # Key: sb.delete must not have been called
    sb.table.assert_not_called()


def test_delete_session_allowed_for_signed(app_and_deps):
    """Authenticated user delete takes the normal SQL path."""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    sb.table.return_value = sb
    sb.delete.return_value = sb
    sb.eq.return_value = sb
    sb.execute.return_value = MagicMock(data=[{"id": "s1"}])

    _override_user(app, get_full, CurrentUser(user_id="signed-u", is_anonymous=False, sb=sb))
    client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = client.delete("/api/sessions/00000000-0000-0000-0000-000000000001")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 204


# 4. stream_and_save RPC accounting ────────────────────────────────────


@pytest.mark.asyncio
async def test_stream_and_save_calls_turn_count_rpc():
    """When session_id is provided, RPC increment_session_turn_count is called.
    RPC failure must not interrupt the main flow."""
    sb = MagicMock()
    for attr in ("table", "insert", "select", "update", "upsert", "eq",
                 "order", "limit", "single", "maybe_single", "rpc"):
        getattr(sb, attr).return_value = sb

    # 1. user insert, 2. rpc increment, 3. assistant insert, 4. count embed
    sb.execute.side_effect = [
        MagicMock(data=None),
        MagicMock(data=[{"turn_count": 4}]),
        MagicMock(data=[{"id": "msg-a1"}]),
        MagicMock(data=[], count=0),
    ]

    async def fake_chat_stream(*args, **kwargs):
        yield "AI 回复"

    # Minimal equivalent of _wrap_fake_stream (avoids importing the test helper)
    class _Streamer:
        def __init__(self, gen):
            self._gen = gen
            self.model_used = "fake/model"
        def __aiter__(self):
            return self._gen

    async def fake_chat_stream_factory(*args, **kwargs):
        return _Streamer(fake_chat_stream())

    with patch("services.stream_manager.get_supabase", return_value=sb), \
         patch("services.stream_manager.build_context", new=AsyncMock(return_value=[])), \
         patch("services.stream_manager.classify_search_intent", new=AsyncMock(return_value=False)), \
         patch("services.stream_manager.chat_stream", side_effect=fake_chat_stream_factory), \
         patch("services.memory_service.store_long_text_chunks", new=AsyncMock(return_value=0)), \
         patch("services.stream_manager._save_summary", new=AsyncMock()), \
         patch("services.memory_service.store_conversation_memory", new=AsyncMock()):

        from services.stream_manager import stream_and_save

        # Pass thread_meta to skip one DB thread query
        events = []
        async for ev in stream_and_save(
            "thread-1", "用户问题",
            thread_meta={"depth": 0, "title": None, "session_id": "s1"},
            session_id="s1",
        ):
            events.append(ev)

    # Verify rpc was called with the correct args
    sb.rpc.assert_any_call("increment_session_turn_count", {"p_session_id": "s1"})


@pytest.mark.asyncio
async def test_stream_and_save_skips_rpc_without_session():
    """Not passing session_id (legacy caller compatibility) -> RPC is not called."""
    sb = MagicMock()
    for attr in ("table", "insert", "select", "update", "upsert", "eq",
                 "order", "limit", "single", "maybe_single", "rpc"):
        getattr(sb, attr).return_value = sb

    sb.execute.side_effect = [
        MagicMock(data=None),  # user insert
        MagicMock(data=[{"id": "msg-a1"}]),  # assistant insert
        MagicMock(data=[], count=0),  # count
    ]

    async def fake_chat_stream(*args, **kwargs):
        yield "回复"

    class _Streamer:
        def __init__(self, gen):
            self._gen = gen
            self.model_used = "fake/model"
        def __aiter__(self):
            return self._gen

    async def fake_chat_stream_factory(*args, **kwargs):
        return _Streamer(fake_chat_stream())

    with patch("services.stream_manager.get_supabase", return_value=sb), \
         patch("services.stream_manager.build_context", new=AsyncMock(return_value=[])), \
         patch("services.stream_manager.classify_search_intent", new=AsyncMock(return_value=False)), \
         patch("services.stream_manager.chat_stream", side_effect=fake_chat_stream_factory), \
         patch("services.memory_service.store_long_text_chunks", new=AsyncMock(return_value=0)), \
         patch("services.stream_manager._save_summary", new=AsyncMock()):

        from services.stream_manager import stream_and_save
        async for _ in stream_and_save(
            "thread-1", "问题",
            thread_meta={"depth": 0, "title": None, "session_id": "s1"},
            # Intentionally do not pass session_id
        ):
            pass

    sb.rpc.assert_not_called()
