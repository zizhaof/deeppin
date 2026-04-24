# tests/test_threads_suggest.py
"""
Tests for the /threads/{id}/suggest endpoint.

Title is bundled into the response so the frontend can swap the anchor-truncated
placeholder for the LLM-generated title in the same poll cycle that already runs
after pin creation. These tests pin that contract across the three serving paths:
cache_hit, poll_hit, and sync_gen.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch


def _make_sb(query_results):
    """Build a Supabase mock that yields query_results in order on each .execute() call.

    Each entry in query_results is a dict that becomes the .data attribute of the
    returned MagicMock (or None to simulate a missing row via maybe_single)."""
    idx = {"n": 0}

    def _execute():
        if idx["n"] >= len(query_results):
            return MagicMock(data=None)
        item = query_results[idx["n"]]
        idx["n"] += 1
        if item is None:
            return MagicMock(data=None)
        return MagicMock(data=item)

    chain = MagicMock()
    chain.select.return_value = chain
    chain.update.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.single.return_value = chain
    chain.execute.side_effect = _execute

    sb = MagicMock()
    sb.table.return_value = chain
    return sb


@pytest.mark.asyncio
async def test_cache_hit_returns_title_and_questions():
    """Title + suggestions both present in DB → returned in a single round-trip."""
    from routers.threads import suggest_questions

    sb = _make_sb([
        {
            "anchor_text": "long anchor",
            "anchor_message_id": None,
            "parent_thread_id": None,
            "suggestions": ["q1", "q2", "q3"],
            "title": "LLM Title",
        },
    ])

    result = await suggest_questions(uuid.uuid4(), auth=("user-id", sb))
    assert result == {"questions": ["q1", "q2", "q3"], "title": "LLM Title"}


@pytest.mark.asyncio
async def test_poll_hit_returns_title_filled_by_background_task():
    """Initial fetch has no suggestions; the polled re-fetch returns both — both flow back."""
    from routers.threads import suggest_questions

    sb = _make_sb([
        # initial select: row exists but background task hasn't completed
        {
            "anchor_text": "anchor",
            "anchor_message_id": None,
            "parent_thread_id": None,
            "suggestions": None,
            "title": None,
        },
        # first poll iteration: background task done, both fields present
        {"suggestions": ["a", "b"], "title": "Background Title"},
    ])

    # Patch sleep so the test doesn't actually wait 200ms.
    with patch("routers.threads.asyncio.sleep", return_value=None):
        result = await suggest_questions(uuid.uuid4(), auth=("user-id", sb))

    assert result == {"questions": ["a", "b"], "title": "Background Title"}


@pytest.mark.asyncio
async def test_sync_gen_returns_title_from_llm():
    """Cache + poll both miss → LLM is invoked synchronously; the title it
    returns is bundled into the response and written back to the DB."""
    from routers.threads import suggest_questions

    # 1 initial select + 15 poll selects (all empty) + 1 update
    empty_row = {"suggestions": None, "title": None}
    sb = _make_sb(
        [
            {
                "anchor_text": "anchor text",
                "anchor_message_id": None,
                "parent_thread_id": None,
                "suggestions": None,
                "title": None,
            },
            *([empty_row] * 15),
            None,  # update returns nothing
        ],
    )

    async def _fake_gen(anchor, ctx):
        return ("Sync LLM Title", ["one", "two"])

    with patch("routers.threads.asyncio.sleep", return_value=None), \
         patch("routers.threads.generate_title_and_suggestions", side_effect=_fake_gen):
        result = await suggest_questions(uuid.uuid4(), auth=("user-id", sb))

    assert result == {"questions": ["one", "two"], "title": "Sync LLM Title"}
