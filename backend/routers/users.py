# backend/routers/users.py
"""
用户账号管理端点
User account management endpoints.

DELETE /api/users/me
  → 删除当前用户的所有数据（sessions/threads/messages/summaries）
  → Delete all data for the current user (sessions/threads/messages/summaries)
  → 同时删除 Supabase Auth 账号
  → Also removes the user from Supabase Auth
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from db.supabase import get_supabase
from dependencies.auth import get_current_user

router = APIRouter()


async def _db(fn):
    """将同步 Supabase 调用包入线程池，避免阻塞 asyncio 事件循环。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.delete("/users/me", status_code=204)
async def delete_account(auth=Depends(get_current_user)):
    """
    删除当前用户的全部数据并注销账号。
    Delete all data for the current user and remove the account from Supabase Auth.

    数据库 sessions 表有 CASCADE，删除 session 后 threads/messages/summaries 自动清除。
    The sessions table uses CASCADE; deleting sessions auto-removes threads/messages/summaries.
    """
    user_id, _sb = auth
    sb_admin = get_supabase()  # service_role，可操作 auth.users / needs service_role for auth admin

    # 1. 删除用户所有 sessions（CASCADE 自动清理关联数据）
    await _db(lambda: sb_admin.table("sessions").delete().eq("user_id", user_id).execute())

    # 2. 从 Supabase Auth 删除账号
    try:
        sb_admin.auth.admin.delete_user(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"删除 Auth 账号失败 / Failed to delete auth account: {exc}",
        )
