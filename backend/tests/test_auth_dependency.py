# backend/tests/test_auth_dependency.py
"""
Unit tests for the Supabase-JWT FastAPI dependency.

Verify the core token decoding logic on get_current_user_full (with is_anonymous);
get_current_user is a thin wrapper that splits the 2-tuple via Depends; pass CurrentUser when calling directly.

The real token-decode logic lives on get_current_user_full (returns is_anonymous);
get_current_user is a thin backward-compat wrapper that unpacks the tuple — calling
it outside FastAPI's DI is just a two-liner passthrough.
"""
import os
import pytest
from unittest.mock import MagicMock, patch


@pytest.mark.asyncio
async def test_missing_credentials_raises_401():
    """No Authorization header -> 401."""
    from dependencies.auth import get_current_user_full
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_full(credentials=None)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    """Supabase rejects the token -> 401."""
    from dependencies.auth import get_current_user_full
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad_token")

    with patch("dependencies.auth.get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_sb.auth.get_user.side_effect = Exception("JWT expired")
        mock_get_sb.return_value = mock_sb

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_full(credentials=creds)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_returns_user_id_and_client():
    """Valid token -> returns CurrentUser(user_id, is_anonymous=False, sb)."""
    from dependencies.auth import get_current_user_full
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")

    mock_user = MagicMock()
    mock_user.user.id = "user-uuid-abc"
    mock_user.user.is_anonymous = False
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

        user = await get_current_user_full(credentials=creds)

    assert user.user_id == "user-uuid-abc"
    assert user.is_anonymous is False
    assert user.sb is mock_sb_user
    mock_sb_user.postgrest.auth.assert_called_once_with("valid_token")


@pytest.mark.asyncio
async def test_anonymous_user_flag_propagated():
    """Anonymous JWT -> is_anonymous=True propagated to the caller."""
    from dependencies.auth import get_current_user_full
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="anon_token")

    mock_user = MagicMock()
    mock_user.user.id = "anon-uid"
    mock_user.user.is_anonymous = True

    with patch("dependencies.auth.get_supabase") as mock_get_sb, \
         patch("dependencies.auth.create_client", return_value=MagicMock()), \
         patch.dict(os.environ, {
             "SUPABASE_URL": "https://proj.supabase.co",
             "SUPABASE_ANON_KEY": "anon-xyz",
         }):
        mock_get_sb.return_value.auth.get_user.return_value = mock_user

        user = await get_current_user_full(credentials=creds)

    assert user.is_anonymous is True
    assert user.user_id == "anon-uid"


@pytest.mark.asyncio
async def test_missing_is_anonymous_defaults_false():
    """    Older supabase-py versions may not expose is_anonymous; default to False."""
    from dependencies.auth import get_current_user_full
    from fastapi.security import HTTPAuthorizationCredentials

    # Use a plain object (no is_anonymous attr) so getattr hits the default.
    class _User:
        id = "legacy-uid"

    class _Response:
        user = _User()

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="legacy_token")

    with patch("dependencies.auth.get_supabase") as mock_get_sb, \
         patch("dependencies.auth.create_client", return_value=MagicMock()), \
         patch.dict(os.environ, {
             "SUPABASE_URL": "https://proj.supabase.co",
             "SUPABASE_ANON_KEY": "anon-xyz",
         }):
        mock_get_sb.return_value.auth.get_user.return_value = _Response()

        user = await get_current_user_full(credentials=creds)

    assert user.is_anonymous is False


@pytest.mark.asyncio
async def test_valid_token_creates_client_with_anon_key():
    """The user-scoped client is created with ANON_KEY rather than the service_role key."""
    from dependencies.auth import get_current_user_full
    from fastapi.security import HTTPAuthorizationCredentials

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")

    mock_user = MagicMock()
    mock_user.user.id = "uid"
    mock_user.user.is_anonymous = False

    with patch("dependencies.auth.get_supabase") as mock_get_sb, \
         patch("dependencies.auth.create_client") as mock_create, \
         patch.dict(os.environ, {
             "SUPABASE_URL": "https://proj.supabase.co",
             "SUPABASE_ANON_KEY": "anon-xyz",
         }):
        mock_get_sb.return_value.auth.get_user.return_value = mock_user
        mock_create.return_value = MagicMock()

        await get_current_user_full(credentials=creds)

    mock_create.assert_called_once_with("https://proj.supabase.co", "anon-xyz")


@pytest.mark.asyncio
async def test_get_user_returns_none_raises_401():
    """    user_response.user is None → 401 (user no longer exists)."""
    from dependencies.auth import get_current_user_full
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
            await get_current_user_full(credentials=creds)

    assert exc_info.value.status_code == 401
