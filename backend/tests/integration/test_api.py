# backend/tests/integration/test_api.py
"""
Integration tests against the live deployed API.

  TEST_BASE_URL=https://deeppin.duckdns.org \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  pytest tests/integration/ -v

TestHealth
TestAuth
TestSession
"""
from __future__ import annotations

import os
import secrets
import uuid
import pytest
import httpx

BASE_URL = os.getenv("TEST_BASE_URL", "https://deeppin.duckdns.org").rstrip("/")


# Helpers ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_headers():
    """
    Use service_role_key via the admin API to dynamically create a temporary test user and obtain a JWT.
    Automatically deletes the user after the test (yield fixture).
    Skipped when credentials are not configured (not counted as a failure).

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

    # Delete the temporary user after all tests finish (success or failure)
    httpx.delete(
        f"{supabase_url}/auth/v1/admin/users/{user_id}",
        headers=admin_headers,
        timeout=10,
    )


# ── TestHealth ─────────────────────────────────────────────────────────────

class TestHealth:
    """Verify the /health aggregate endpoint -- no authentication required."""

    def test_is_reachable(self):
        """        Endpoint is reachable and returns a valid health-check response.
        200 = all healthy, 503 = degraded (e.g. Groq rate-limited in CI).
        """
        r = httpx.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code in (200, 503), (
            f"Unexpected status {r.status_code}: {r.text}"
        )
        assert "status" in r.json(), "Response body missing 'status' field"

    def test_status_field_present(self):
        """        Response body contains a valid 'status' field.
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
    """Verify the auth middleware -- no authentication required."""

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
    Verify session CRUD -- requires a real JWT (depends on the auth_headers fixture).
    Skips the entire class when credentials are not configured.
    """

    def test_list_sessions(self, auth_headers):
        r = httpx.get(f"{BASE_URL}/api/sessions", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_session_lifecycle(self, auth_headers):
        """Create -> appears in list -> delete -> disappears."""
        # Create
        r = httpx.post(
            f"{BASE_URL}/api/sessions",
            headers=auth_headers,
            json={"title": "[CI] Integration Test"},
            timeout=10,
        )
        assert r.status_code == 201, f"Create failed: {r.text}"
        session_id = r.json()["id"]

        try:
            # Appears in list
            r = httpx.get(f"{BASE_URL}/api/sessions", headers=auth_headers, timeout=10)
            assert r.status_code == 200
            ids = [s["id"] for s in r.json()]
            assert session_id in ids, f"Session {session_id} not in list"

            # Fetch detail
            r = httpx.get(f"{BASE_URL}/api/sessions/{session_id}",
                          headers=auth_headers, timeout=10)
            assert r.status_code == 200
            assert r.json()["id"] == session_id

        finally:
            # Cleanup regardless of assertion outcome
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
    Zero-quota provider validation — no auth required.

    Validate via each provider's /v1/models endpoint:
      - Every key is valid (not 401/403)
      - Every model_id declared in config is still in the provider's catalog (no drift)
    Real inference validation is run daily by the daily-provider-check workflow, not here.

    Validates via each provider's /v1/models endpoint that keys are legitimate and
    configured model_ids still appear in the upstream catalog. Actual inference
    testing lives in the daily-provider-check workflow.
    """

    def test_keys_and_model_catalog(self):
        """        Every (provider, key) has a valid key AND all configured models are in its catalog."""
        r = httpx.get(f"{BASE_URL}/health/providers/keys", timeout=30)
        assert r.status_code in (200, 503), f"Unexpected status: {r.status_code}"
        data = r.json()

        assert data["total"] > 0, "No provider/key pairs configured"

        # Print each result for CI debugging
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

