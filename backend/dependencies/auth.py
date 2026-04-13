# backend/dependencies/auth.py
"""
FastAPI dependency: 验证 Supabase JWT，返回 (user_id, user_scoped_client)。
FastAPI dependency: validates the Supabase JWT and returns (user_id, user-scoped Supabase client).

user_scoped_client 使用用户 JWT 发起 DB 查询，使 RLS 的 auth.uid() 生效。
The user-scoped client issues DB queries with the user JWT so RLS's auth.uid() resolves correctly.
"""

import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from db.supabase import get_supabase

# auto_error=False 让我们自己返回 401 而不是 FastAPI 默认的 403
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> tuple[str, Client]:
    """
    验证请求携带的 Bearer token，返回 (user_id, user_scoped_supabase_client)。
    无 token 或 token 无效 → 401。
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

    return user_id, sb_user
