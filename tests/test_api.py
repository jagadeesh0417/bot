"""Smoke tests using mongomock-motor (no real MongoDB needed)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import mongomock_motor
from httpx import ASGITransport, AsyncClient

from app.config import settings as settings_module
from app.database import mongo as mongo_module


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    monkeypatch.setattr(settings_module.settings, "MONGODB_URL", "mongodb://mock")
    monkeypatch.setattr(settings_module.settings, "MONGODB_DB", "college_ai_test")
    monkeypatch.setattr(settings_module.settings, "AI_PROVIDER", "none")
    monkeypatch.setattr(settings_module.settings, "SECRET_KEY", "test-secret-key-for-smoke-tests")
    monkeypatch.setattr(settings_module.settings, "CLOUDINARY_CLOUD_NAME", "")
    yield


@pytest.fixture
async def client():
    mock = mongomock_motor.AsyncMongoMockClient()
    mongo_module._client = mock
    mongo_module._db = mock[settings_module.settings.MONGODB_DB]

    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

    mongo_module._client = None
    mongo_module._db = None


@pytest.fixture
async def token(client):
    r = await client.post(
        "/api/auth/register",
        json={
            "name": "Test Student",
            "email": "student@test.edu",
            "password": "StrongPass123",
            "semester": 1,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_register_and_me(client):
    r = await client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "alice@test.edu", "password": "AlicePass123", "semester": 2},
    )
    assert r.status_code == 201
    assert r.json()["role"] == "student"
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "alice@test.edu"


@pytest.mark.asyncio
async def test_duplicate_email_rejected(client):
    data = {"name": "Bob", "email": "bob@test.edu", "password": "BobPass1234"}
    r1 = await client.post("/api/auth/register", json=data)
    r2 = await client.post("/api/auth/register", json=data)
    assert r1.status_code == 201
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_login_and_refresh(client):
    await client.post(
        "/api/auth/register",
        json={"name": "Carol", "email": "carol@test.edu", "password": "CarolPass123"},
    )
    r = await client.post("/api/auth/login", json={"email": "carol@test.edu", "password": "CarolPass123"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    refresh = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 200
    assert refresh.json()["access_token"]


@pytest.mark.asyncio
async def test_invalid_login(client):
    r = await client.post("/api/auth/login", json={"email": "nobody@test.edu", "password": "WrongPass123"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_forgot_and_reset_password(client):
    await client.post("/api/auth/register", json={"name": "Dan", "email": "dan@test.edu", "password": "DanPass1234"})
    f = await client.post("/api/auth/forgot-password", json={"email": "dan@test.edu"})
    assert f.status_code == 200
    token = f.json()["reset_token"]
    r = await client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPass4567"})
    assert r.status_code == 200
    login = await client.post("/api/auth/login", json={"email": "dan@test.edu", "password": "NewPass4567"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_role_guard(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.get("/api/dashboard/stats", headers=headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_departments_crud_requires_admin(client):
    r = await client.post("/api/departments", json={"name": "CSE", "code": "CS"})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_chatbot_answers_without_ai(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post("/api/chat", headers=headers, json={"message": "When are exams?"})
    assert r.status_code == 200
    body = r.json()
    assert body["session_id"]
    assert body["answer"]
    sessions = await client.get("/api/chat/sessions", headers=headers)
    assert sessions.status_code == 200
    assert sessions.json()["total"] >= 1


@pytest.mark.asyncio
async def test_chat_history_and_search(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/chat", headers=headers, json={"message": "Tell me about hostel rules"})
    h = await client.get("/api/chat/history?q=hostel", headers=headers)
    assert h.status_code == 200
    assert h.json()["total"] >= 1


@pytest.mark.asyncio
async def test_global_search(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.get("/api/search?q=test", headers=headers)
    assert r.status_code == 200
    assert "students" in r.json()


@pytest.mark.asyncio
async def test_notices_flow(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    n = await client.post(
        "/api/notices",
        headers=headers,
        json={"title": "Mid-sem exams", "content": "Exams start 20 Nov", "pinned": True},
    )
    assert n.status_code == 403
    assert n.json()["code"] == "forbidden"
