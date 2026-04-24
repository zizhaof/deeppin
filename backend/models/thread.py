# backend/models/thread.py
"""
Pydantic models for thread (pin) API requests and responses.

A thread is either the main thread (parent_thread_id=None, depth=0)
or a sub-thread created by pinning (depth >= 1).
"""

from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class CreateThreadRequest(BaseModel):
    """
    Request body for creating a thread (main or sub-thread/pin).
    """
    session_id: uuid.UUID

    # Parent thread ID; None indicates this is the main thread
    parent_thread_id: uuid.UUID | None = None

    # Anchor text selected by the user; required when creating a pin
    anchor_text: str | None = None

    # ID of the message containing the anchor
    anchor_message_id: uuid.UUID | None = None

    # Character offsets of the anchor text within the message content
    anchor_start_offset: int | None = None
    anchor_end_offset: int | None = None

    # Depth passed directly from the frontend to avoid an extra DB round-trip
    depth: int | None = None

    # Current frontend UI locale; forces the output language of the LLM-generated
    # title and suggested follow-up questions for this sub-thread.
    lang: str | None = None


class Thread(BaseModel):
    """
    Response model matching the `threads` table schema.
    """
    id: uuid.UUID
    session_id: uuid.UUID

    # None indicates the main thread (depth=0)
    parent_thread_id: uuid.UUID | None

    anchor_text: str | None
    anchor_message_id: uuid.UUID | None
    anchor_start_offset: int | None
    anchor_end_offset: int | None

    # Title is written back asynchronously by a background LLM task
    title: str | None

    # Nesting depth: 0=main thread, 1=first sub-thread level, unbounded
    depth: int = Field(ge=0)

    created_at: datetime
