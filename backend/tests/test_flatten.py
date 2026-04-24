# tests/test_flatten.py
"""
Tests for the flatten feature.

Covers:
  - compute_preorder: preorder ordering, nesting, empty sub-threads, orphans, sibling order
  - is_already_flattened idempotency check
  - POST /api/sessions/{id}/flatten endpoint: normal path, already-flattened idempotency, empty session, missing main thread
"""

import uuid
import pytest
from unittest.mock import MagicMock

from services.flatten_service import compute_preorder, is_already_flattened


# ──────────────────────────────────────────────────────────────────────────
# pure-function unit tests
# ──────────────────────────────────────────────────────────────────────────

class TestComputePreorder:
    """compute_preorder covers various preorder DFS topologies."""

    def test_main_only_no_pins(self):
        """Main thread only, no pins: keep original order, position 0..N-1."""
        main = "main"
        threads = [{"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"}]
        msgs = {main: [{"id": "m1"}, {"id": "m2"}, {"id": "m3"}]}

        result = compute_preorder(main, threads, msgs)

        assert result == [
            {"id": "m1", "position": 0},
            {"id": "m2", "position": 1},
            {"id": "m3", "position": 2},
        ]

    def test_one_pin_after_first_message(self):
        """Main m1->m2 with a pin anchored on m1: m1 -> pin messages -> m2."""
        main, pin = "main", "pin1"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
        ]
        msgs = {
            main: [{"id": "m1"}, {"id": "m2"}],
            pin:  [{"id": "p1"}, {"id": "p2"}],
        }

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1", "p1", "p2", "m2"]
        assert [r["position"] for r in result] == [0, 1, 2, 3]

    def test_nested_pins(self):
        """Nested: main m1->m2, pin1 anchored on m1 (contains p1), pin2 anchored on p1 (contains q1)."""
        main, pin1, pin2 = "main", "pin1", "pin2"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin1, "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
            {"id": pin2, "parent_thread_id": pin1, "anchor_message_id": "p1", "created_at": "t2"},
        ]
        msgs = {
            main: [{"id": "m1"}, {"id": "m2"}],
            pin1: [{"id": "p1"}],
            pin2: [{"id": "q1"}, {"id": "q2"}],
        }

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1", "p1", "q1", "q2", "m2"]

    def test_sibling_pins_ordered_by_created_at(self):
        """Multiple pins on the same message expand in created_at ascending order."""
        main, pin_a, pin_b = "main", "pinA", "pinB"
        threads = [
            {"id": main,  "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            # pinB is created after pinA, so it should appear after pinA
            {"id": pin_b, "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t2"},
            {"id": pin_a, "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
        ]
        msgs = {
            main:  [{"id": "m1"}],
            pin_a: [{"id": "a1"}],
            pin_b: [{"id": "b1"}],
        }

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1", "a1", "b1"]

    def test_empty_pin_thread(self):
        """Sub-thread with no messages: preorder skips it without affecting the main thread."""
        main, pin = "main", "pin1"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}, {"id": "m2"}], pin: []}

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1", "m2"]

    def test_orphan_pin_without_anchor_skipped(self):
        """Orphan sub-threads without anchor_message_id are skipped (defensive)."""
        main, orphan = "main", "orphan"
        threads = [
            {"id": main,   "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": orphan, "parent_thread_id": main, "anchor_message_id": None, "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}], orphan: [{"id": "o1"}]}

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1"]

    def test_pin_anchored_to_unknown_message_ignored(self):
        """Anchored to a message id not in the main thread: messages do not appear, the pin is naturally skipped."""
        main, pin = "main", "pin1"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "ghost", "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}], pin: [{"id": "p1"}]}

        result = compute_preorder(main, threads, msgs)

        # The pin's anchor message is not in the main message stream -> no insertion point -> pin messages are lost (known destructive behavior)
        assert [r["id"] for r in result] == ["m1"]

    def test_main_no_messages_returns_empty(self):
        """Main thread has zero messages -> no insertion point, returns empty."""
        main = "main"
        threads = [{"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"}]
        msgs = {main: []}

        assert compute_preorder(main, threads, msgs) == []

    def test_positions_are_dense_and_monotonic(self):
        """position sequence is strictly increasing, with no gaps, starting from 0."""
        main, pin = "main", "pin"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}, {"id": "m2"}], pin: [{"id": "p1"}, {"id": "p2"}]}

        positions = [r["position"] for r in compute_preorder(main, threads, msgs)]

        assert positions == list(range(len(positions)))


# ──────────────────────────────────────────────────────────────────────────
# is_already_flattened
# ──────────────────────────────────────────────────────────────────────────

class TestIsAlreadyFlattened:
    def test_empty(self):
        assert is_already_flattened([]) is False

    def test_all_null_position(self):
        assert is_already_flattened([{"id": "a", "position": None}, {"id": "b"}]) is False

    def test_any_with_position_is_flattened(self):
        assert is_already_flattened([{"id": "a", "position": None}, {"id": "b", "position": 0}]) is True

    def test_position_zero_counts(self):
        """position=0 is a valid value and must not be misread as falsy."""
        assert is_already_flattened([{"id": "a", "position": 0}]) is True


# ──────────────────────────────────────────────────────────────────────────
# endpoint tests
# ──────────────────────────────────────────────────────────────────────────

def _make_sb_for_flatten(*, session_exists, threads, messages, rpc_raises=None):
    """
      1) sessions.select.eq.maybe_single   → session_res
      2) threads.select.eq.eq.order        → threads_res
      3) messages.select.in_.order         → messages_res
    Build a supabase mock that replays calls in order.
    """
    sb = MagicMock()

    # table() returns a chain that switches based on call_count
    table_calls = {"n": 0}

    def table_side_effect(name):
        # Each .table("xxx") call returns an independent chain
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        chain.order.return_value = chain
        chain.neq.return_value = chain
        chain.update.return_value = chain
        chain.maybe_single.return_value = chain

        idx = table_calls["n"]
        table_calls["n"] += 1
        if name == "sessions" and idx == 0:
            chain.execute.return_value = MagicMock(data={"id": "sess-id"} if session_exists else None)
        elif name == "threads":
            chain.execute.return_value = MagicMock(data=threads)
        elif name == "messages":
            chain.execute.return_value = MagicMock(data=messages)
        else:
            chain.execute.return_value = MagicMock(data=None)
        return chain

    sb.table.side_effect = table_side_effect

    rpc_chain = MagicMock()
    if rpc_raises is not None:
        rpc_chain.execute.side_effect = rpc_raises
    else:
        rpc_chain.execute.return_value = MagicMock(data=None)
    sb.rpc.return_value = rpc_chain

    return sb


@pytest.mark.asyncio
async def test_flatten_happy_path():
    """Main thread with two messages, one pin anchored on m1: flatten succeeds and calls RPC."""
    from routers.sessions import flatten_session

    main_id = "main-uuid"
    pin_id  = "pin-uuid"
    threads = [
        {"id": main_id, "parent_thread_id": None, "anchor_message_id": None, "depth": 0, "created_at": "t0"},
        {"id": pin_id,  "parent_thread_id": main_id, "anchor_message_id": "m1", "depth": 1, "created_at": "t1"},
    ]
    messages = [
        {"id": "m1", "thread_id": main_id, "position": None, "created_at": "t0a"},
        {"id": "m2", "thread_id": main_id, "position": None, "created_at": "t0b"},
        {"id": "p1", "thread_id": pin_id,  "position": None, "created_at": "t1a"},
    ]
    sb = _make_sb_for_flatten(session_exists=True, threads=threads, messages=messages)

    sid = uuid.uuid4()
    result = await flatten_session(sid, auth=("user-1", sb))

    assert result["already_flattened"] is False
    assert result["flattened_thread_count"] == 1

    # RPC call argument validation: main + p1 (preorder insertion point) + m2
    sb.rpc.assert_called_once()
    rpc_args = sb.rpc.call_args
    assert rpc_args[0][0] == "flatten_session"
    payload = rpc_args[0][1]
    assert payload["p_main_thread_id"] == main_id
    assert [o["id"] for o in payload["p_message_orders"]] == ["m1", "p1", "m2"]
    assert [o["position"] for o in payload["p_message_orders"]] == [0, 1, 2]


@pytest.mark.asyncio
async def test_flatten_idempotent_when_already_flattened():
    """Main-thread messages already have positions: returns already_flattened directly without calling RPC."""
    from routers.sessions import flatten_session

    main_id = "main-uuid"
    threads = [
        {"id": main_id, "parent_thread_id": None, "anchor_message_id": None, "depth": 0, "created_at": "t0"},
    ]
    messages = [
        {"id": "m1", "thread_id": main_id, "position": 0, "created_at": "t0a"},
        {"id": "m2", "thread_id": main_id, "position": 1, "created_at": "t0b"},
    ]
    sb = _make_sb_for_flatten(session_exists=True, threads=threads, messages=messages)

    sid = uuid.uuid4()
    result = await flatten_session(sid, auth=("user-1", sb))

    assert result["already_flattened"] is True
    assert result["flattened_thread_count"] == 0
    sb.rpc.assert_not_called()


@pytest.mark.asyncio
async def test_flatten_404_when_session_missing():
    """Session not found: raises 404."""
    from fastapi import HTTPException
    from routers.sessions import flatten_session

    sb = _make_sb_for_flatten(session_exists=False, threads=[], messages=[])
    sid = uuid.uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await flatten_session(sid, auth=("user-1", sb))
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_flatten_500_when_main_thread_missing():
    """Session exists but has no main thread (data anomaly): 500."""
    from fastapi import HTTPException
    from routers.sessions import flatten_session

    threads = [
        # Only sub-threads, no main thread -- impossible but defensive
        {"id": "pin-only", "parent_thread_id": "ghost", "anchor_message_id": "m1", "depth": 1, "created_at": "t1"},
    ]
    sb = _make_sb_for_flatten(session_exists=True, threads=threads, messages=[])

    sid = uuid.uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await flatten_session(sid, auth=("user-1", sb))
    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_flatten_empty_session_with_no_messages():
    """Both main and sub-threads have no messages: RPC is not called, but active sub-threads are still marked flattened."""
    from routers.sessions import flatten_session

    main_id = "main-uuid"
    pin_id  = "pin-uuid"
    threads = [
        {"id": main_id, "parent_thread_id": None, "anchor_message_id": None, "depth": 0, "created_at": "t0"},
        {"id": pin_id,  "parent_thread_id": main_id, "anchor_message_id": "ghost", "depth": 1, "created_at": "t1"},
    ]
    sb = _make_sb_for_flatten(session_exists=True, threads=threads, messages=[])

    sid = uuid.uuid4()
    result = await flatten_session(sid, auth=("user-1", sb))

    assert result["already_flattened"] is False
    assert result["flattened_thread_count"] == 1
    sb.rpc.assert_not_called()


@pytest.mark.asyncio
async def test_flatten_rpc_failure_returns_500():
    """RPC raises: converted to 500."""
    from fastapi import HTTPException
    from routers.sessions import flatten_session

    main_id = "main-uuid"
    threads = [
        {"id": main_id, "parent_thread_id": None, "anchor_message_id": None, "depth": 0, "created_at": "t0"},
    ]
    messages = [{"id": "m1", "thread_id": main_id, "position": None, "created_at": "t0a"}]
    sb = _make_sb_for_flatten(
        session_exists=True, threads=threads, messages=messages,
        rpc_raises=RuntimeError("postgres exploded"),
    )

    sid = uuid.uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await flatten_session(sid, auth=("user-1", sb))
    assert exc_info.value.status_code == 500
    assert "扁平化失败" in exc_info.value.detail or "Flatten failed" in exc_info.value.detail
