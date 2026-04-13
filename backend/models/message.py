# backend/models/message.py
"""
Message Pydantic 模型
Pydantic models for message API requests and responses.
"""

from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    """
    发送消息的请求体，用于 /threads/{id}/chat 和 /threads/{id}/autostart 端点。
    Request body for sending a message, used by the chat and autostart endpoints.
    """
    # 消息内容，不允许为空字符串
    # Message content; empty strings are rejected
    content: str = Field(min_length=1)


class Message(BaseModel):
    """
    Message 响应模型，与数据库 messages 表结构对应。
    Response model matching the `messages` table schema.
    """
    id: uuid.UUID
    thread_id: uuid.UUID

    # 角色严格限定为 user 或 assistant，与 OpenAI/Groq API 保持一致
    # Role is strictly 'user' or 'assistant', consistent with the OpenAI/Groq API
    role: Literal["user", "assistant"]

    content: str = Field(min_length=1)

    # token_count 由后端写入，前端只读；暂未填充
    # token_count is written by the backend and read-only for clients; not yet populated
    token_count: int | None

    created_at: datetime
