# backend/routers/sessions.py
"""
Session 路由
Session router — create and retrieve sessions.

端点列表 / Endpoints:
  GET    /api/sessions               列出当前用户的所有 sessions
  POST   /api/sessions               创建 session（同时自动创建主线 thread）
  GET    /api/sessions/{session_id}  获取 session 及其所有 threads
  DELETE /api/sessions/{session_id}  删除 session（CASCADE 删除所有 threads/messages/summaries）
  GET    /api/sessions/{session_id}/messages  批量获取所有 thread 消息
"""

import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException

from db.supabase import get_supabase
from dependencies.auth import get_current_user
from models.session import CreateSessionRequest, Session

router = APIRouter()


async def _db(fn):
    """将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.get("/sessions")
async def list_sessions(auth=Depends(get_current_user)):
    """获取当前用户的所有 sessions，按创建时间倒序，最多返回 50 条。"""
    _user_id, sb = auth
    res = await _db(lambda: (
        sb.table("sessions")
        .select("id, title, created_at")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ))
    return res.data or []


@router.post("/sessions", response_model=Session, status_code=201)
async def create_session(body: CreateSessionRequest, auth=Depends(get_current_user)):
    """创建新 session，并自动创建对应的主线 thread（depth=0）。"""
    user_id, sb = auth

    session_res = await _db(lambda: sb.table("sessions").insert({
        "title": body.title,
        "user_id": user_id,
    }).execute())

    if not session_res.data:
        raise HTTPException(status_code=500, detail="创建 session 失败 / Failed to create session")

    session = session_res.data[0]

    thread_res = await _db(lambda: sb.table("threads").insert({
        "session_id": session["id"],
        "depth": 0,
    }).execute())

    if not thread_res.data:
        await _db(lambda: sb.table("sessions").delete().eq("id", session["id"]).execute())
        raise HTTPException(status_code=500, detail="创建主线程失败 / Failed to create main thread")

    return session


@router.get("/sessions/{session_id}")
async def get_session(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """获取指定 session 及其所有 threads（按创建时间升序）。RLS 自动过滤非本人数据。"""
    _user_id, sb = auth

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


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """删除指定 session（RLS 保证只能删自己的）。CASCADE 自动清理 threads/messages/summaries。"""
    _user_id, sb = auth
    res = await _db(lambda: (
        sb.table("sessions").delete().eq("id", str(session_id)).execute()
    ))
    if not res.data:
        raise HTTPException(status_code=404, detail="Session 不存在或无权限 / Session not found or unauthorized")


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: uuid.UUID, auth=Depends(get_current_user)):
    """批量获取该 session 下所有线程的消息，按 thread_id 分组返回。"""
    _user_id, sb = auth

    threads_res = await _db(lambda: (
        sb.table("threads")
        .select("id")
        .eq("session_id", str(session_id))
        .execute()
    ))
    thread_ids = [t["id"] for t in (threads_res.data or [])]
    if not thread_ids:
        return {}

    messages_res = await _db(lambda: (
        sb.table("messages")
        .select("*")
        .in_("thread_id", thread_ids)
        .order("created_at")
        .execute()
    ))

    result: dict[str, list] = {tid: [] for tid in thread_ids}
    for msg in (messages_res.data or []):
        tid = msg["thread_id"]
        if tid in result:
            result[tid].append(msg)

    return result
