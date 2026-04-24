# backend/models/session.py
"""
Pydantic models for session API requests and responses.
"""

from pydantic import BaseModel
from datetime import datetime
import uuid


class CreateSessionRequest(BaseModel):
    """
    Request body for creating a new session.

    title: Optional; auto-generated after the first conversation round if omitted.

    id: Optional client-pre-generated UUID. When provided, the backend uses it directly
        instead of letting the DB auto-generate one.
    """
    title: str | None = None
    id: uuid.UUID | None = None


class Session(BaseModel):
    """
    Response model matching the `sessions` table schema.
    """
    id: uuid.UUID
    title: str | None
    created_at: datetime
