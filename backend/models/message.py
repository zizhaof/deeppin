from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    content: str = Field(min_length=1)


class Message(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    token_count: int | None
    created_at: datetime
