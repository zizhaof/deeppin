"""验证 sessions 端点在无 token 时返回 401。"""
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    # main.py 在导入时校验必要环境变量，测试中提前注入占位值
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    import importlib
    import main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app, raise_server_exceptions=False)


def test_list_sessions_requires_auth(client):
    response = client.get("/api/sessions")
    assert response.status_code == 401


def test_create_session_requires_auth(client):
    response = client.post("/api/sessions", json={"title": "test"})
    assert response.status_code == 401


def test_get_session_requires_auth(client):
    response = client.get("/api/sessions/00000000-0000-0000-0000-000000000001")
    assert response.status_code == 401
