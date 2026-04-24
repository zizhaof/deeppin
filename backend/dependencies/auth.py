# backend/dependencies/auth.py
"""
FastAPI dependency: validates the Supabase JWT and returns (user_id, user-scoped Supabase client).

The user-scoped client issues DB queries with the user JWT so RLS's auth.uid() resolves correctly.

Anonymous-user support:
    Supabase signInAnonymously issues a regular JWT whose user.is_anonymous is True.
    Call-sites that need to throttle anonymous users (/chat, POST /sessions)
    depend on get_current_user_full.
"""

import os
from typing import NamedTuple

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from db.supabase import get_supabase

# auto_error=False so we return 401 ourselves instead of FastAPI's default 403
_bearer = HTTPBearer(auto_error=False)


class CurrentUser(NamedTuple):
    """Full authenticated-user info."""
    user_id: str
    is_anonymous: bool
    sb: Client  # user-scoped client (RLS enforced via auth.uid())


async def get_current_user_full(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """
    Validate Bearer token; return full info including is_anonymous.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = credentials.credentials

    # Use the service_role client to verify token authenticity
    try:
        sb_admin = get_supabase()
        user_response = sb_admin.auth.get_user(token)
        if user_response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id: str = user_response.user.id
        # Supabase User schema includes is_anonymous; default to False if missing.
        is_anonymous: bool = bool(getattr(user_response.user, "is_anonymous", False))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

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
    Backward-compatible 2-tuple; most routers only need user_id + scoped client.
    """
    return user.user_id, user.sb
