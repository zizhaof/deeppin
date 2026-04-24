# backend/services/flatten_service.py
"""
Flatten service: merge all sub-thread messages back into the main thread using preorder DFS.

Invariants:
  - For each message, all its child threads (pins anchored to it) are inserted right after that message,
    All sub-threads anchored to a message are inserted right after it, before the next
    message in the same thread.
    Sibling pins at the same anchor are ordered by created_at for determinism.
    Sub-threads without anchor_message_id are skipped (defensive — should not occur).
"""

from collections import defaultdict


def compute_preorder(
    main_thread_id: str,
    threads: list[dict],
    messages_by_thread: dict[str, list[dict]],
) -> list[dict]:
    """
    Compute the preorder sequence; returns [{"id": <msg_uuid>, "position": <int>}, ...].

    Args:
                 anchor_message_id / created_at。
                 All active threads in the session; each must include id /
                 parent_thread_id / anchor_message_id / created_at.
                 Dict mapping thread_id to list of messages, sorted by created_at ascending.

    Returns:
        Flat list of {"id", "position"} dicts ready to send to the flatten_session RPC.
    """
    # Anchor reverse index: anchor_message_id → list of pin threads (sorted by created_at)
    pins_by_anchor: dict[str, list[dict]] = defaultdict(list)
    for t in threads:
        if t["id"] == main_thread_id:
            continue
        anchor_msg = t.get("anchor_message_id")
        if not anchor_msg:
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
    Idempotency check: if any main-thread message has a non-null position, the session
    is considered already flattened.
    """
    return any(m.get("position") is not None for m in main_thread_messages)
