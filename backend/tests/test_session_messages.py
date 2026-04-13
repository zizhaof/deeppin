# tests/test_session_messages.py
"""
GET /api/sessions/{session_id}/messages 端点测试
Tests for the bulk session messages endpoint.

覆盖 / Covers:
  - 正常路径：按 thread_id 分组返回
    Happy path: messages grouped by thread_id
  - 无线程 session 返回空字典
    Session with no threads returns empty dict
  - 每个 thread 都有对应键（即使无消息）
    Every thread_id has a key even if it has no messages
"""

import pytest
from unittest.mock import patch, MagicMock


def _make_sb(thread_data, message_data):
    """构造能依次返回 thread 列表和 message 列表的 Supabase mock。"""
    call_count = {"n": 0}
    results = [
        MagicMock(data=thread_data),
        MagicMock(data=message_data),
    ]

    def _execute():
        r = results[call_count["n"]]
        call_count["n"] += 1
        return r

    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.order.return_value = chain
    chain.execute.side_effect = _execute

    sb = MagicMock()
    sb.table.return_value = chain
    return sb


@pytest.mark.asyncio
async def test_happy_path_groups_by_thread():
    """两个 thread 各有消息，返回正确分组。"""
    from routers.sessions import get_session_messages

    tid1, tid2 = "aaaa", "bbbb"
    threads = [{"id": tid1}, {"id": tid2}]
    messages = [
        {"id": "m1", "thread_id": tid1, "role": "user",      "content": "hi",    "token_count": None, "created_at": "2024-01-01T00:00:00"},
        {"id": "m2", "thread_id": tid1, "role": "assistant",  "content": "hello", "token_count": 5,    "created_at": "2024-01-01T00:00:01"},
        {"id": "m3", "thread_id": tid2, "role": "user",       "content": "hey",   "token_count": None, "created_at": "2024-01-01T00:00:02"},
    ]

    import uuid
    sid = uuid.uuid4()

    with patch("routers.sessions.get_supabase", return_value=_make_sb(threads, messages)):
        result = await get_session_messages(sid)

    assert set(result.keys()) == {tid1, tid2}
    assert len(result[tid1]) == 2
    assert len(result[tid2]) == 1
    assert result[tid1][0]["id"] == "m1"
    assert result[tid2][0]["id"] == "m3"


@pytest.mark.asyncio
async def test_no_threads_returns_empty_dict():
    """session 下没有 thread 时直接返回空字典，不发第二次 DB 查询。"""
    from routers.sessions import get_session_messages

    import uuid
    sid = uuid.uuid4()

    # 只需要第一次查询（threads）返回空列表
    sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    sb.table.return_value = chain

    with patch("routers.sessions.get_supabase", return_value=sb):
        result = await get_session_messages(sid)

    assert result == {}
    # 只调用了一次 table()（threads 查询），没有第二次
    assert sb.table.call_count == 1


@pytest.mark.asyncio
async def test_thread_with_no_messages_still_has_key():
    """有 thread 但无消息时，该 thread_id 仍作为键存在（值为空列表）。"""
    from routers.sessions import get_session_messages

    tid = "cccc"
    import uuid
    sid = uuid.uuid4()

    with patch("routers.sessions.get_supabase", return_value=_make_sb([{"id": tid}], [])):
        result = await get_session_messages(sid)

    assert tid in result
    assert result[tid] == []


@pytest.mark.asyncio
async def test_message_not_in_known_threads_is_ignored():
    """messages 里出现未知 thread_id 时安全忽略，不写入结果。"""
    from routers.sessions import get_session_messages

    tid = "dddd"
    import uuid
    sid = uuid.uuid4()

    messages = [
        {"id": "m1", "thread_id": tid,     "role": "user", "content": "a", "token_count": None, "created_at": "2024-01-01"},
        {"id": "m2", "thread_id": "zzzz",  "role": "user", "content": "b", "token_count": None, "created_at": "2024-01-01"},
    ]

    with patch("routers.sessions.get_supabase", return_value=_make_sb([{"id": tid}], messages)):
        result = await get_session_messages(sid)

    assert "zzzz" not in result
    assert len(result[tid]) == 1
