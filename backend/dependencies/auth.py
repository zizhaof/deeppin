# backend/dependencies/auth.py
"""
FastAPI dependency: 验证 Supabase JWT，返回 (user_id, user_scoped_client)。
FastAPI dependency: validates the Supabase JWT and returns (user_id, user-scoped Supabase client).

user_scoped_client 使用用户 JWT 发起 DB 查询，使 RLS 的 auth.uid() 生效。
The user-scoped client issues DB queries with the user JWT so RLS's auth.uid() resolves correctly.

匿名用户支持 / Anonymous-user support:
  - Supabase 的 signInAnonymously 会发一个正常 JWT，但 user.is_anonymous == True。
    Supabase signInAnonymously issues a regular JWT whose user.is_anonymous is True.
  - 需要感知匿名身份以限流的地方（/chat, /sessions POST）用 get_current_user_full。
    Call-sites that need to throttle anonymous users (/chat, POST /sessions)
    depend on get_current_user_full.
"""

import os
from typing import NamedTuple

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from db.supabase import get_supabase

# auto_error=False 让我们自己返回 401 而不是 FastAPI 默认的 403
_bearer = HTTPBearer(auto_error=False)


class CurrentUser(NamedTuple):
    """认证后的完整用户信息 / Full authenticated-user info."""
    user_id: str
    is_anonymous: bool
    sb: Client  # user-scoped client (RLS enforced via auth.uid())


async def get_current_user_full(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """
    验证 Bearer token，返回完整用户信息（含 is_anonymous）。
    Validate Bearer token; return full info including is_anonymous.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = credentials.credentials

    # 用 service_role 客户端验证 token 真实性
    try:
        sb_admin = get_supabase()
        user_response = sb_admin.auth.get_user(token)
        if user_response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id: str = user_response.user.id
        # Supabase User schema 带 is_anonymous 字段；字段缺失视为非匿名（防御性兜底）
        # Supabase User schema includes is_anonymous; default to False if missing.
        is_anonymous: bool = bool(getattr(user_response.user, "is_anonymous", False))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # 每次请求创建一个新的用户身份客户端，代价是 supabase-py 的连接初始化开销。
    # MVP 规模下可接受；生产规模时可考虑复用 postgrest builder。
    # A new user-scoped client is created per request (supabase-py connection init overhead).
    # Acceptable at MVP scale; consider reusing the postgrest builder in production.
    supabase_url = os.environ["SUPABASE_URL"]
    anon_key = os.environ["SUPABASE_ANON_KEY"]
    sb_user: Client = create_client(supabase_url, anon_key)
    sb_user.postgrest.auth(token)

    return CurrentUser(user_id=user_id, is_anonymous=is_anonymous, sb=sb_user)


async def get_current_user(
    user: CurrentUser = Depends(get_current_user_full),
) -> tuple[str, Client]:
    """
    向后兼容的 2-tuple 版本。多数 router 只需要 user_id + scoped client。
    Backward-compatible 2-tuple; most routers only need user_id + scoped client.
    """
    return user.user_id, user.sb
