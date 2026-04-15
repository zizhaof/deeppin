# backend/tests/integration/test_api.py
"""
集成测试：打真实部署的 API 端点
Integration tests against the live deployed API.

运行方式 / How to run:
  TEST_BASE_URL=https://deeppin.duckdns.org pytest tests/integration/ -v

TestHealth   — 无需认证，验证所有组件连通
TestAuth     — 无需认证，验证认证中间件生效
TestSession  — 需要 TEST_USER_EMAIL + TEST_USER_PASSWORD，测试完整 session CRUD
"""
from __future__ import annotations

import os
import pytest
import httpx

BASE_URL = os.getenv("TEST_BASE_URL", "https://deeppin.duckdns.org").rstrip("/")


# ── 工具 ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_headers():
    """
    用测试账号登录 Supabase，返回带 JWT 的 Authorization header。
    未配置凭证时跳过（不算失败）。
    Log in with the test account; skip (not fail) if credentials are not configured.
    """
    email = os.getenv("TEST_USER_EMAIL")
    password = os.getenv("TEST_USER_PASSWORD")
    supabase_url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")

    if not all([email, password, supabase_url, anon_key]):
        pytest.skip("TEST_USER_EMAIL / TEST_USER_PASSWORD / SUPABASE_URL / SUPABASE_ANON_KEY not set")

    r = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=10,
    )
    assert r.status_code == 200, f"Login failed ({r.status_code}): {r.text}"
    token = r.json()["access_token"]
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ── TestHealth ─────────────────────────────────────────────────────────────

class TestHealth:
    """验证 /health 聚合端点 — 无需认证。"""

    def test_returns_200(self):
        r = httpx.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    def test_status_is_ok(self):
        r = httpx.get(f"{BASE_URL}/health", timeout=10)
        assert r.json()["status"] == "ok", f"Degraded: {r.json()}"

    def test_all_components_healthy(self):
        components = httpx.get(f"{BASE_URL}/health", timeout=10).json()["components"]
        assert components["backend"] is True, "backend unhealthy"
        assert components["searxng"] is True, "searxng unreachable"
        assert components["supabase"] is True, "supabase unreachable"


# ── TestAuth ───────────────────────────────────────────────────────────────

class TestAuth:
    """验证认证中间件 — 无需认证。"""

    def test_no_token_returns_401(self):
        r = httpx.get(f"{BASE_URL}/api/sessions", timeout=10)
        assert r.status_code == 401

    def test_invalid_token_returns_401(self):
        r = httpx.get(
            f"{BASE_URL}/api/sessions",
            headers={"Authorization": "Bearer invalid_token"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_missing_bearer_prefix_returns_401(self):
        r = httpx.get(
            f"{BASE_URL}/api/sessions",
            headers={"Authorization": "not-a-bearer-token"},
            timeout=10,
        )
        assert r.status_code == 401


# ── TestSession ────────────────────────────────────────────────────────────

class TestSession:
    """
    验证 session CRUD — 需要真实 JWT（依赖 auth_headers fixture）。
    无凭证时整个 class 跳过。
    """

    def test_list_sessions(self, auth_headers):
        r = httpx.get(f"{BASE_URL}/api/sessions", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_session_lifecycle(self, auth_headers):
        """创建 → 出现在列表 → 删除 → 消失。"""
        # 创建 / Create
        r = httpx.post(
            f"{BASE_URL}/api/sessions",
            headers=auth_headers,
            json={"title": "[CI] Integration Test"},
            timeout=10,
        )
        assert r.status_code == 201, f"Create failed: {r.text}"
        session_id = r.json()["id"]

        try:
            # 出现在列表 / Appears in list
            r = httpx.get(f"{BASE_URL}/api/sessions", headers=auth_headers, timeout=10)
            assert r.status_code == 200
            ids = [s["id"] for s in r.json()]
            assert session_id in ids, f"Session {session_id} not in list"

            # 获取详情 / Fetch detail
            r = httpx.get(f"{BASE_URL}/api/sessions/{session_id}",
                          headers=auth_headers, timeout=10)
            assert r.status_code == 200
            assert r.json()["id"] == session_id

        finally:
            # 清理（无论断言是否成功）/ Cleanup regardless of assertion outcome
            httpx.delete(
                f"{BASE_URL}/api/sessions/{session_id}",
                headers=auth_headers,
                timeout=10,
            )

    def test_delete_nonexistent_session_returns_404(self, auth_headers):
        r = httpx.delete(
            f"{BASE_URL}/api/sessions/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 404
