"""匿名用户试用额度 + session 限制 + delete 禁令的单测。
Unit tests for anon trial quota, 1-session limit, and delete gating.

只测路由层 gate（依赖 override 注入 CurrentUser）。stream_and_save 内部的
RPC 递增在下方 test_stream_manager_increments_turn_count 里验证。
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
    """加载 app 并返回 (app, get_current_user_full) 便于 override。"""
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
    """匿名 + turn_count==20 → 402 anon_quota_exceeded。"""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    # thread_res (maybe_single)
    thread_chain = MagicMock()
    thread_chain.data = {"id": "t1", "depth": 0, "title": None, "session_id": "s1"}
    # session_res (maybe_single) — turn_count 已达上限
    session_chain = MagicMock()
    session_chain.data = {"turn_count": 20}
    # 两次 execute 依次返回上述
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
    """匿名 + turn_count<20 → 不 gate，走到 StreamingResponse。"""
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

    # patch stream_and_save 本身，避免真跑 LLM 链
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
    """登录用户 turn_count 任意值都不 gate。"""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    thread_chain = MagicMock()
    thread_chain.data = {"id": "t1", "depth": 0, "title": None, "session_id": "s1"}
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.eq.return_value = sb
    sb.maybe_single.return_value = sb
    # 只会查一次（thread_res），session_res 路径被 is_anonymous=False 跳过
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


# ── 2. /sessions POST 匿名 1-session 上限 ─────────────────────────────


def test_create_session_blocks_second_anon(app_and_deps):
    """匿名已有 1 个 session → 再建返回 402 anon_session_limit。"""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.limit.return_value = sb
    count_chain = MagicMock()
    count_chain.count = 1  # 已有 1 个 session
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
    """匿名首个 session → 允许创建。"""
    app, get_full, CurrentUser = app_and_deps

    sb = MagicMock()
    sb.table.return_value = sb
    sb.select.return_value = sb
    sb.limit.return_value = sb
    sb.insert.return_value = sb
    sb.delete.return_value = sb
    sb.eq.return_value = sb
    # execute 顺序：count(sessions)=0 / insert session / insert main thread
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


# ── 3. /sessions DELETE 匿名禁令 ───────────────────────────────────────


def test_delete_session_forbidden_for_anon(app_and_deps):
    """匿名试删 → 403 anon_cannot_delete。
    防止「删了再建」绕过 20 turn 配额。"""
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
    # 关键：sb.delete 不该被调用过
    sb.table.assert_not_called()


def test_delete_session_allowed_for_signed(app_and_deps):
    """登录用户 delete 走正常 SQL 路径。"""
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


# ── 4. stream_and_save 的 RPC 记账 ────────────────────────────────────


@pytest.mark.asyncio
async def test_stream_and_save_calls_turn_count_rpc():
    """session_id 给了就调 RPC increment_session_turn_count。
    RPC 失败也不应该中断主流程。"""
    sb = MagicMock()
    for attr in ("table", "insert", "select", "update", "upsert", "eq",
                 "order", "limit", "single", "maybe_single", "rpc"):
        getattr(sb, attr).return_value = sb

    # execute 顺序：
    # 1. user insert, 2. rpc increment, 3. assistant insert, 4. count embed
    sb.execute.side_effect = [
        MagicMock(data=None),
        MagicMock(data=[{"turn_count": 4}]),
        MagicMock(data=[{"id": "msg-a1"}]),
        MagicMock(data=[], count=0),
    ]

    async def fake_chat_stream(*args, **kwargs):
        yield "AI 回复"

    # _wrap_fake_stream 的最小等价实现（避免 import 测试用 helper）
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

        # 传 thread_meta 省一次 DB 查线程
        events = []
        async for ev in stream_and_save(
            "thread-1", "用户问题",
            thread_meta={"depth": 0, "title": None, "session_id": "s1"},
            session_id="s1",
        ):
            events.append(ev)

    # 验证 rpc 被调用，参数正确
    sb.rpc.assert_any_call("increment_session_turn_count", {"p_session_id": "s1"})


@pytest.mark.asyncio
async def test_stream_and_save_skips_rpc_without_session():
    """不传 session_id（老调用方兼容）→ 不调 RPC。"""
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
            # 故意不传 session_id
        ):
            pass

    sb.rpc.assert_not_called()
