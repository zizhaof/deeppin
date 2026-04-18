# backend/services/flatten_service.py
"""
扁平化服务：把 session 下所有子线程的消息按 preorder DFS 合并回主线。
Flatten service: merge all sub-thread messages back into the main thread using preorder DFS.

铁律 / Invariants:
  - 一个 message 的所有子线程（pins anchored to it）紧跟在该 message 之后插入，
    然后回到同一 thread 的下一条 message。
    All sub-threads anchored to a message are inserted right after it, before the next
    message in the same thread.
  - 同级 sibling pins 按 created_at 升序，保持确定性。
    Sibling pins at the same anchor are ordered by created_at for determinism.
  - 没有 anchor_message_id 的孤儿子线程被忽略（理论上不存在，防御性处理）。
    Sub-threads without anchor_message_id are skipped (defensive — should not occur).
"""

from collections import defaultdict


def compute_preorder(
    main_thread_id: str,
    threads: list[dict],
    messages_by_thread: dict[str, list[dict]],
) -> list[dict]:
    """
    计算 preorder 序列，返回 [{"id": <msg_uuid>, "position": <int>}, ...]。
    Compute the preorder sequence; returns [{"id": <msg_uuid>, "position": <int>}, ...].

    Args:
        main_thread_id: 主线 thread id（字符串形式）/ Main thread id as string.
        threads: session 下所有 active threads，每条至少含 id / parent_thread_id /
                 anchor_message_id / created_at。
                 All active threads in the session; each must include id /
                 parent_thread_id / anchor_message_id / created_at.
        messages_by_thread: {thread_id: [msg, ...]}，每个 list 已按 created_at 升序。
                 Dict mapping thread_id to list of messages, sorted by created_at ascending.

    Returns:
        Flat list of {"id", "position"} dicts ready to send to the flatten_session RPC.
    """
    # 锚点倒排索引：anchor_message_id → 子线程列表（按 created_at 排序）
    # Anchor reverse index: anchor_message_id → list of pin threads (sorted by created_at)
    pins_by_anchor: dict[str, list[dict]] = defaultdict(list)
    for t in threads:
        if t["id"] == main_thread_id:
            continue
        anchor_msg = t.get("anchor_message_id")
        if not anchor_msg:
            # 孤儿子线程：无锚点，无法定位插入点，跳过
            # Orphan pin: no anchor → cannot determine insertion point, skip
            continue
        pins_by_anchor[anchor_msg].append(t)

    for anchor_id in pins_by_anchor:
        pins_by_anchor[anchor_id].sort(key=lambda t: t.get("created_at") or "")

    result: list[dict] = []
    counter = 0

    def walk(thread_id: str) -> None:
        nonlocal counter
        for msg in messages_by_thread.get(thread_id, []):
            result.append({"id": msg["id"], "position": counter})
            counter += 1
            for pin in pins_by_anchor.get(msg["id"], []):
                walk(pin["id"])

    walk(main_thread_id)
    return result


def is_already_flattened(main_thread_messages: list[dict]) -> bool:
    """
    幂等性判定：主线任何一条消息有 position 即视为已扁平化。
    Idempotency check: if any main-thread message has a non-null position, the session
    is considered already flattened.
    """
    return any(m.get("position") is not None for m in main_thread_messages)
