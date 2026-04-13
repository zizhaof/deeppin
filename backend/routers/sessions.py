# backend/routers/sessions.py
"""
Session 路由
Session router — create and retrieve sessions.

端点列表 / Endpoints:
  GET  /api/sessions               列出所有 sessions / List all sessions
  POST /api/sessions               创建 session（同时自动创建主线 thread）
                                   Create a session (auto-creates the main thread)
  GET  /api/sessions/{session_id}  获取 session 及其所有 threads
                                   Get a session with all its threads
"""

import asyncio
import uuid
from fastapi import APIRouter, HTTPException

from db.supabase import get_supabase
from models.session import CreateSessionRequest, Session

router = APIRouter()


async def _db(fn):
    """
    将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。
    Wrap a synchronous Supabase call in a thread-pool executor to avoid blocking the event loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.get("/sessions")
async def list_sessions():
    """
    获取所有 sessions，按创建时间倒序，最多返回 50 条。
    Return all sessions ordered by creation time descending, capped at 50.
    """
    sb = get_supabase()
    res = await _db(lambda: (
        sb.table("sessions")
        .select("id, title, created_at")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ))
    return res.data or []


@router.post("/sessions", response_model=Session, status_code=201)
async def create_session(body: CreateSessionRequest):
    """
    创建新 session，并自动创建对应的主线 thread（depth=0）。
    Create a new session and automatically create the main thread (depth=0) for it.

    若主线 thread 创建失败，回滚 session 并返回 500。
    If the main thread creation fails, the session is rolled back and a 500 is returned.
    """
    sb = get_supabase()

    # 创建 session 记录 / Create the session record
    session_res = await _db(lambda: sb.table("sessions").insert({
        "title": body.title,
    }).execute())

    if not session_res.data:
        raise HTTPException(status_code=500, detail="创建 session 失败 / Failed to create session")

    session = session_res.data[0]

    # 自动创建主线 thread（parent_thread_id=NULL, depth=0）
    # Auto-create the main thread (parent_thread_id=NULL, depth=0)
    thread_res = await _db(lambda: sb.table("threads").insert({
        "session_id": session["id"],
        "depth": 0,
    }).execute())

    if not thread_res.data:
        # 主线创建失败，回滚 session，避免孤立记录
        # Main thread creation failed; roll back the session to avoid orphaned records
        await _db(lambda: sb.table("sessions").delete().eq("id", session["id"]).execute())
        raise HTTPException(status_code=500, detail="创建主线程失败 / Failed to create main thread")

    return session


@router.get("/sessions/{session_id}")
async def get_session(session_id: uuid.UUID):
    """
    获取指定 session 及其所有 threads（按创建时间升序）。
    Get the specified session along with all its threads ordered by creation time.
    """
    sb = get_supabase()

    # 使用 maybe_single() 避免记录不存在时抛出异常
    # Use maybe_single() to avoid an exception when the record does not exist
    session_res = await _db(lambda: (
        sb.table("sessions").select("*").eq("id", str(session_id)).maybe_single().execute()
    ))
    if not session_res or not session_res.data:
        raise HTTPException(status_code=404, detail="Session 不存在 / Session not found")

    threads_res = await _db(lambda: (
        sb.table("threads")
        .select("*")
        .eq("session_id", str(session_id))
        .order("created_at")
        .execute()
    ))

    return {
        **session_res.data,
        "threads": threads_res.data or [],
    }
