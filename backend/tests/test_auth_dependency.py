# backend/tests/test_auth_dependency.py
"""
FastAPI auth dependency 单元测试
Unit tests for the get_current_user FastAPI dependency.
"""
import os
import pytest
from unittest.mock import MagicMock, patch


@pytest.mark.asyncio
async def test_missing_credentials_raises_401():
    """无 Authorization header → 401."""
    from dependencies.auth import get_current_user
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials=None)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    """Supabase 拒绝 token → 401."""
    from dependencies.auth import get_current_user
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad_token")

    with patch("dependencies.auth.get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_sb.auth.get_user.side_effect = Exception("JWT expired")
        mock_get_sb.return_value = mock_sb

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_returns_user_id_and_client():
    """有效 token → 返回正确的 user_id 和用户身份客户端。"""
    from dependencies.auth import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")

    mock_user = MagicMock()
    mock_user.user.id = "user-uuid-abc"
    mock_sb_user = MagicMock()

    with patch("dependencies.auth.get_supabase") as mock_get_sb, \
         patch("dependencies.auth.create_client", return_value=mock_sb_user), \
         patch.dict(os.environ, {
             "SUPABASE_URL": "https://test.supabase.co",
             "SUPABASE_ANON_KEY": "anon-key-123",
         }):
        mock_admin = MagicMock()
        mock_admin.auth.get_user.return_value = mock_user
        mock_get_sb.return_value = mock_admin

        user_id, sb = await get_current_user(credentials=creds)

    assert user_id == "user-uuid-abc"
    assert sb is mock_sb_user
    mock_sb_user.postgrest.auth.assert_called_once_with("valid_token")


@pytest.mark.asyncio
async def test_valid_token_creates_client_with_anon_key():
    """user-scoped 客户端使用 ANON_KEY 而非 service_role key 创建。"""
    from dependencies.auth import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")

    mock_user = MagicMock()
    mock_user.user.id = "uid"

    with patch("dependencies.auth.get_supabase") as mock_get_sb, \
         patch("dependencies.auth.create_client") as mock_create, \
         patch.dict(os.environ, {
             "SUPABASE_URL": "https://proj.supabase.co",
             "SUPABASE_ANON_KEY": "anon-xyz",
         }):
        mock_get_sb.return_value.auth.get_user.return_value = mock_user
        mock_create.return_value = MagicMock()

        await get_current_user(credentials=creds)

    mock_create.assert_called_once_with("https://proj.supabase.co", "anon-xyz")


@pytest.mark.asyncio
async def test_get_user_returns_none_raises_401():
    """user_response.user 为 None 时 → 401（token 对应用户不存在）。
    user_response.user is None → 401 (user no longer exists)."""
    from dependencies.auth import get_current_user
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="ghost_token")

    with patch("dependencies.auth.get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_response = MagicMock()
        mock_response.user = None
        mock_sb.auth.get_user.return_value = mock_response
        mock_get_sb.return_value = mock_sb

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds)

    assert exc_info.value.status_code == 401
