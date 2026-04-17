# backend/tests/integration/test_api.py
"""
集成测试：打真实部署的 API 端点
Integration tests against the live deployed API.

运行方式 / How to run:
  TEST_BASE_URL=https://deeppin.duckdns.org \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  pytest tests/integration/ -v

TestHealth   — 无需认证，验证所有组件连通
TestAuth     — 无需认证，验证认证中间件生效
TestSession  — 需要 Supabase 凭证，动态创建/删除临时测试用户，不依赖任何真实账号
"""
from __future__ import annotations

import os
import secrets
import uuid
import pytest
import httpx

BASE_URL = os.getenv("TEST_BASE_URL", "https://deeppin.duckdns.org").rstrip("/")


# ── 工具 ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_headers():
    """
    用 service_role_key 通过 admin API 动态创建临时测试用户，获取 JWT。
    测试结束后自动删除该用户（yield fixture）。
    未配置凭证时跳过（不算失败）。

    Dynamically creates a temporary test user via the Supabase admin API using the
    service_role_key, obtains a JWT, then deletes the user after the session ends.
    Skips gracefully if credentials are not configured.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not all([supabase_url, anon_key, service_key]):
        pytest.skip("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set")

    admin_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    # 创建临时测试用户（随机 email + 强密码，email 直接标记为已验证）
    # Create a temporary test user with a random email; mark email as confirmed immediately
    test_email = f"ci-{uuid.uuid4().hex[:8]}@deeppin-ci.test"
    test_password = secrets.token_urlsafe(24)

    create_r = httpx.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers=admin_headers,
        json={"email": test_email, "password": test_password, "email_confirm": True},
        timeout=10,
    )
    assert create_r.status_code == 200, f"Failed to create test user: {create_r.text}"
    user_id = create_r.json()["id"]

    # 用 email/password 登录获取 JWT
    # Sign in with email/password to obtain a JWT
    signin_r = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        json={"email": test_email, "password": test_password},
        timeout=10,
    )
    assert signin_r.status_code == 200, f"Sign-in failed: {signin_r.text}"
    token = signin_r.json()["access_token"]

    yield {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # 测试结束后删除临时用户（无论测试成功失败）
    # Delete the temporary user after all tests finish (success or failure)
    httpx.delete(
        f"{supabase_url}/auth/v1/admin/users/{user_id}",
        headers=admin_headers,
        timeout=10,
    )


# ── TestHealth ─────────────────────────────────────────────────────────────

class TestHealth:
    """验证 /health 聚合端点 — 无需认证。"""

    def test_is_reachable(self):
        """端点可达且返回合法的健康检查响应（200 = 全部正常，503 = 部分降级）。
        Endpoint is reachable and returns a valid health-check response.
        200 = all healthy, 503 = degraded (e.g. Groq rate-limited in CI).
        """
        r = httpx.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code in (200, 503), (
            f"Unexpected status {r.status_code}: {r.text}"
        )
        assert "status" in r.json(), "Response body missing 'status' field"

    def test_status_field_present(self):
        """响应体包含 status 字段，值为 'ok' 或 'degraded'。
        Response body contains a valid 'status' field.
        """
        r = httpx.get(f"{BASE_URL}/health", timeout=10)
        assert r.json().get("status") in ("ok", "degraded"), (
            f"Unexpected status value: {r.json()}"
        )

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


# ── TestProviders ─────────────────────────────────────────────────────────

class TestProviders:
    """
    零 quota provider 校验 — 无需认证。
    Zero-quota provider validation — no auth required.

    通过 provider 的 /v1/models 端点校验：
      - 每个 key 合法（非 401/403）
      - 配置里声明的 model_id 仍挂在 provider 的模型清单上（无 drift）
    真实推理验证由 daily-provider-check workflow 每日跑一次，不放这里。

    Validates via each provider's /v1/models endpoint that keys are legitimate and
    configured model_ids still appear in the upstream catalog. Actual inference
    testing lives in the daily-provider-check workflow.
    """

    def test_keys_and_model_catalog(self):
        """每个 (provider, key) 的 key 合法 + 配置的模型仍在清单上。
        Every (provider, key) has a valid key AND all configured models are in its catalog."""
        r = httpx.get(f"{BASE_URL}/health/providers/keys", timeout=30)
        assert r.status_code in (200, 503), f"Unexpected status: {r.status_code}"
        data = r.json()

        assert data["total"] > 0, "No provider/key pairs configured"

        # 打印每个结果方便 CI 调试 / Print each result for CI debugging
        for result in data["results"]:
            if result["ok"]:
                print(f"  {result['provider']} [{result['key']}] → OK "
                      f"(catalog has {result.get('available_count', '?')} models)")
            elif result.get("missing_models"):
                print(f"  {result['provider']} [{result['key']}] → DRIFT: "
                      f"missing {result['missing_models']}")
            else:
                print(f"  {result['provider']} [{result['key']}] → FAIL: "
                      f"{result.get('error', 'unknown')}")

        failures = [r for r in data["results"] if not r["ok"]]
        assert not failures, (
            f"{len(failures)}/{data['total']} (provider, key) pairs failed key/catalog check: "
            + "; ".join(
                f"{r['provider']}[{r['key']}]: "
                + (f"missing={r['missing_models']}" if r.get("missing_models")
                   else r.get("error", "?"))
                for r in failures
            )
        )

