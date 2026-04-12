from pydantic import BaseModel
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    content: str


class Message(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    role: str
    content: str
    token_count: int | None
    created_at: datetime
