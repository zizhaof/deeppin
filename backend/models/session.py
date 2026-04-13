# backend/models/session.py
"""
Session Pydantic 模型
Pydantic models for session API requests and responses.
"""

from pydantic import BaseModel
from datetime import datetime
import uuid


class CreateSessionRequest(BaseModel):
    """
    创建 session 的请求体。
    Request body for creating a new session.

    title: 可选，不传时由首轮对话后自动生成。
    title: Optional; auto-generated after the first conversation round if omitted.
    """
    title: str | None = None


class Session(BaseModel):
    """
    Session 响应模型，与数据库 sessions 表结构对应。
    Response model matching the `sessions` table schema.
    """
    id: uuid.UUID
    title: str | None
    created_at: datetime
