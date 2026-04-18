# tests/test_flatten.py
"""
扁平化功能测试
Tests for the flatten feature.

覆盖 / Covers:
  - compute_preorder：preorder 顺序、嵌套、空子线程、孤儿、sibling 顺序
  - is_already_flattened 幂等判定
  - POST /api/sessions/{id}/flatten 端点：正常路径、已扁平化幂等、空 session、缺主线
"""

import uuid
import pytest
from unittest.mock import MagicMock

from services.flatten_service import compute_preorder, is_already_flattened


# ──────────────────────────────────────────────────────────────────────────
# compute_preorder — 纯函数单测 / pure-function unit tests
# ──────────────────────────────────────────────────────────────────────────

class TestComputePreorder:
    """compute_preorder 覆盖 preorder DFS 的各种拓扑形态."""

    def test_main_only_no_pins(self):
        """只有主线、没有针：保持原顺序，position 0..N-1."""
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
        """主线 m1→m2，针挂在 m1 上：m1 → 针消息 → m2."""
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
        """嵌套：主线 m1→m2，pin1 挂 m1（含 p1），pin2 挂 p1（含 q1）."""
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
        """同一 message 上的多个针按 created_at 升序展开."""
        main, pin_a, pin_b = "main", "pinA", "pinB"
        threads = [
            {"id": main,  "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            # pinB 比 pinA 晚创建，应排在 pinA 之后
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
        """子线程没有消息：preorder 跳过它，不影响主线."""
        main, pin = "main", "pin1"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "m1", "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}, {"id": "m2"}], pin: []}

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1", "m2"]

    def test_orphan_pin_without_anchor_skipped(self):
        """没有 anchor_message_id 的孤儿子线程被跳过（防御性）."""
        main, orphan = "main", "orphan"
        threads = [
            {"id": main,   "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": orphan, "parent_thread_id": main, "anchor_message_id": None, "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}], orphan: [{"id": "o1"}]}

        result = compute_preorder(main, threads, msgs)

        assert [r["id"] for r in result] == ["m1"]

    def test_pin_anchored_to_unknown_message_ignored(self):
        """锚定到一个不在主线里的 message id：消息不会出现，针自然被跳过."""
        main, pin = "main", "pin1"
        threads = [
            {"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"},
            {"id": pin,  "parent_thread_id": main, "anchor_message_id": "ghost", "created_at": "t1"},
        ]
        msgs = {main: [{"id": "m1"}], pin: [{"id": "p1"}]}

        result = compute_preorder(main, threads, msgs)

        # pin 的锚点 message 不在主线消息流里 → 没有插入点 → 针消息丢失（已知的破坏性行为）
        assert [r["id"] for r in result] == ["m1"]

    def test_main_no_messages_returns_empty(self):
        """主线一条消息没有 → 没有插入点，返回空."""
        main = "main"
        threads = [{"id": main, "parent_thread_id": None, "anchor_message_id": None, "created_at": "t0"}]
        msgs = {main: []}

        assert compute_preorder(main, threads, msgs) == []

    def test_positions_are_dense_and_monotonic(self):
        """position 序列严格递增、无空洞、从 0 起."""
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
        """position=0 是合法值，不能当成 falsy 漏判."""
        assert is_already_flattened([{"id": "a", "position": 0}]) is True


# ──────────────────────────────────────────────────────────────────────────
# POST /api/sessions/{id}/flatten — 端点测试 / endpoint tests
# ──────────────────────────────────────────────────────────────────────────

def _make_sb_for_flatten(*, session_exists, threads, messages, rpc_raises=None):
    """
    构造一个 supabase mock，按调用顺序回放：
      1) sessions.select.eq.maybe_single   → session_res
      2) threads.select.eq.eq.order        → threads_res
      3) messages.select.in_.order         → messages_res
      4) (可选) rpc("flatten_session", ...) → 成功或抛异常
    Build a supabase mock that replays calls in order.
    """
    sb = MagicMock()

    # table() 返回根据 call_count 切换的 chain
    table_calls = {"n": 0}

    def table_side_effect(name):
        # 每次 .table("xxx") 返回独立 chain
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
    """主线两条消息，一个针挂在 m1，扁平化成功并调用 RPC."""
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
    assert result["main_thread_id"] == main_id
    assert result["flattened_thread_count"] == 1
    assert result["message_count"] == 3

    # RPC 调用参数校验：main + p1（preorder 插入点）+ m2
    sb.rpc.assert_called_once()
    rpc_args = sb.rpc.call_args
    assert rpc_args[0][0] == "flatten_session"
    payload = rpc_args[0][1]
    assert payload["p_main_thread_id"] == main_id
    assert [o["id"] for o in payload["p_message_orders"]] == ["m1", "p1", "m2"]
    assert [o["position"] for o in payload["p_message_orders"]] == [0, 1, 2]


@pytest.mark.asyncio
async def test_flatten_idempotent_when_already_flattened():
    """主线消息已有 position：直接返回 already_flattened，不调 RPC."""
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
    assert result["message_count"] == 2
    sb.rpc.assert_not_called()


@pytest.mark.asyncio
async def test_flatten_404_when_session_missing():
    """session 不存在：抛 404."""
    from fastapi import HTTPException
    from routers.sessions import flatten_session

    sb = _make_sb_for_flatten(session_exists=False, threads=[], messages=[])
    sid = uuid.uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await flatten_session(sid, auth=("user-1", sb))
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_flatten_500_when_main_thread_missing():
    """session 存在但没有主线（数据异常）：500."""
    from fastapi import HTTPException
    from routers.sessions import flatten_session

    threads = [
        # 只有子线程没有主线 — 不可能但防御
        {"id": "pin-only", "parent_thread_id": "ghost", "anchor_message_id": "m1", "depth": 1, "created_at": "t1"},
    ]
    sb = _make_sb_for_flatten(session_exists=True, threads=threads, messages=[])

    sid = uuid.uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await flatten_session(sid, auth=("user-1", sb))
    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_flatten_empty_session_with_no_messages():
    """主线和子线程都没有消息：不调 RPC，但仍把 active 子线程标记 flattened."""
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
    assert result["message_count"] == 0
    assert result["flattened_thread_count"] == 1
    sb.rpc.assert_not_called()


@pytest.mark.asyncio
async def test_flatten_rpc_failure_returns_500():
    """RPC 抛异常：转成 500."""
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
