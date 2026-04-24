# backend/models/message.py
"""
Pydantic models for message API requests and responses.
"""

from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    """
    Request body for sending a message to the chat endpoint.
    """
    # Message content; empty strings are rejected
    content: str = Field(min_length=1)

    # Filename of the RAG-indexed file associated with this message.
    # Passed by the frontend when the user has just uploaded a file, so RAG prioritizes its chunks.
    attachment_filename: str | None = None

    # Current frontend UI locale; forces the output language of the assistant reply,
    # the META-block summary/title, and any fallback summarization that runs afterwards.
    lang: str | None = None


class Message(BaseModel):
    """
    Response model matching the `messages` table schema.
    """
    id: uuid.UUID
    thread_id: uuid.UUID

    # Role is strictly 'user' or 'assistant', consistent with the OpenAI/Groq API
    role: Literal["user", "assistant"]

    content: str = Field(min_length=1)

    created_at: datetime
