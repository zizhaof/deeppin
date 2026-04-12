from pydantic import BaseModel
from datetime import datetime
import uuid


class CreateSessionRequest(BaseModel):
    title: str | None = None


class Session(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
