"""验证 sessions 端点在无 token 时返回 401。"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app, raise_server_exceptions=False)


def test_list_sessions_requires_auth(client):
    response = client.get("/api/sessions")
    assert response.status_code == 401


def test_create_session_requires_auth(client):
    response = client.post("/api/sessions", json={"title": "test"})
    assert response.status_code == 401


def test_get_session_requires_auth(client):
    response = client.get("/api/sessions/00000000-0000-0000-0000-000000000001")
    assert response.status_code == 401
