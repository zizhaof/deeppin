# backend/routers/users.py
"""
User account management endpoints.

DELETE /api/users/me
  → Delete all data for the current user (sessions/threads/messages/summaries)
  → Also removes the user from Supabase Auth
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from db.supabase import get_supabase
from dependencies.auth import get_current_user

router = APIRouter()


async def _db(fn):
    """Wrap synchronous Supabase calls in a thread pool to avoid blocking the asyncio event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, fn)


@router.delete("/users/me", status_code=204)
async def delete_account(auth=Depends(get_current_user)):
    """
    Delete all data for the current user and remove the account from Supabase Auth.

    The sessions table uses CASCADE; deleting sessions auto-removes threads/messages/summaries.
    """
    user_id, _sb = auth
    sb_admin = get_supabase()  # needs service_role for auth admin

    # 1. Delete all of the user's sessions (CASCADE auto-cleans related data)
    await _db(lambda: sb_admin.table("sessions").delete().eq("user_id", user_id).execute())

    # 2. Delete the account from Supabase Auth
    try:
        sb_admin.auth.admin.delete_user(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"删除 Auth 账号失败 / Failed to delete auth account: {exc}",
        )
