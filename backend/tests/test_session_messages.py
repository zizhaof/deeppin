# tests/test_session_messages.py
"""
Tests for the bulk session messages endpoint.

Covers:
    Happy path: messages grouped by thread_id
    Session with no threads returns empty dict
    Every thread_id has a key even if it has no messages
"""

import pytest
from unittest.mock import MagicMock


def _make_sb(thread_data, message_data):
    """Build a Supabase mock that returns the thread list and then the message list in sequence."""
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
    """Two threads each with messages return the correct grouping."""
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

    result = await get_session_messages(sid, auth=("mock-user", _make_sb(threads, messages)))

    assert set(result.keys()) == {tid1, tid2}
    assert len(result[tid1]) == 2
    assert len(result[tid2]) == 1
    assert result[tid1][0]["id"] == "m1"
    assert result[tid2][0]["id"] == "m3"


@pytest.mark.asyncio
async def test_no_threads_returns_empty_dict():
    """When the session has no thread, return an empty dict directly without a second DB query."""
    from routers.sessions import get_session_messages

    import uuid
    sid = uuid.uuid4()

    # Only the first query (threads) needs to return an empty list
    sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    sb.table.return_value = chain

    result = await get_session_messages(sid, auth=("mock-user", sb))

    assert result == {}
    # table() is called exactly once (threads query); no second call
    assert sb.table.call_count == 1


@pytest.mark.asyncio
async def test_thread_with_no_messages_still_has_key():
    """When threads exist but have no messages, the thread_id key still appears (with an empty list)."""
    from routers.sessions import get_session_messages

    tid = "cccc"
    import uuid
    sid = uuid.uuid4()

    result = await get_session_messages(sid, auth=("mock-user", _make_sb([{"id": tid}], [])))

    assert tid in result
    assert result[tid] == []


@pytest.mark.asyncio
async def test_message_not_in_known_threads_is_ignored():
    """Unknown thread_ids in messages are safely ignored and not written to the result."""
    from routers.sessions import get_session_messages

    tid = "dddd"
    import uuid
    sid = uuid.uuid4()

    messages = [
        {"id": "m1", "thread_id": tid,     "role": "user", "content": "a", "token_count": None, "created_at": "2024-01-01"},
        {"id": "m2", "thread_id": "zzzz",  "role": "user", "content": "b", "token_count": None, "created_at": "2024-01-01"},
    ]

    result = await get_session_messages(sid, auth=("mock-user", _make_sb([{"id": tid}], messages)))

    assert "zzzz" not in result
    assert len(result[tid]) == 1
