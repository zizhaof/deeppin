from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class CreateThreadRequest(BaseModel):
    session_id: uuid.UUID
    parent_thread_id: uuid.UUID | None = None
    anchor_text: str | None = None
    anchor_message_id: uuid.UUID | None = None


class Thread(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    parent_thread_id: uuid.UUID | None
    anchor_text: str | None
    depth: int = Field(ge=0)
    created_at: datetime
