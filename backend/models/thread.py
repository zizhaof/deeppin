# backend/models/thread.py
"""
Thread Pydantic 模型
Pydantic models for thread (pin) API requests and responses.

Thread 可以是主线（parent_thread_id=None, depth=0）或子线程（插针）。
A thread is either the main thread (parent_thread_id=None, depth=0)
or a sub-thread created by pinning (depth >= 1).
"""

from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class CreateThreadRequest(BaseModel):
    """
    创建线程（主线或子线程）的请求体。
    Request body for creating a thread (main or sub-thread/pin).
    """
    session_id: uuid.UUID

    # 父线程 ID，为 None 时表示主线
    # Parent thread ID; None indicates this is the main thread
    parent_thread_id: uuid.UUID | None = None

    # 用户选中的锚点文字，插针时必填
    # Anchor text selected by the user; required when creating a pin
    anchor_text: str | None = None

    # 锚点所在的消息 ID
    # ID of the message containing the anchor
    anchor_message_id: uuid.UUID | None = None

    # 子线程显示在主线左侧还是右侧
    # Which side of the main thread this sub-thread appears on: 'left' or 'right'
    side: str | None = None

    # 锚点文字在消息内容中的字符偏移量
    # Character offsets of the anchor text within the message content
    anchor_start_offset: int | None = None
    anchor_end_offset: int | None = None

    # 前端直接传入嵌套深度，省去后端查 DB
    # Depth passed directly from the frontend to avoid an extra DB round-trip
    depth: int | None = None


class Thread(BaseModel):
    """
    Thread 响应模型，与数据库 threads 表结构对应。
    Response model matching the `threads` table schema.
    """
    id: uuid.UUID
    session_id: uuid.UUID

    # None 表示主线（depth=0）
    # None indicates the main thread (depth=0)
    parent_thread_id: uuid.UUID | None

    anchor_text: str | None
    anchor_message_id: uuid.UUID | None
    anchor_start_offset: int | None
    anchor_end_offset: int | None
    side: str | None

    # 标题和建议追问由后台 LLM 异步生成后回写
    # Title and suggested questions are written back asynchronously by a background LLM task
    title: str | None
    suggestions: list[str] | None = None

    # 嵌套深度：0=主线，1=第一层子线程，以此类推，无上限
    # Nesting depth: 0=main thread, 1=first sub-thread level, unbounded
    depth: int = Field(ge=0)

    created_at: datetime
