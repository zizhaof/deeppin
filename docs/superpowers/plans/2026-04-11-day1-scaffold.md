# Day 1 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a locally-running full-stack Deeppin app where the main-thread AI conversation streams via SSE in the browser.

**Architecture:** FastAPI backend handles AI calls (DeepSeek/Gemini via `litellm` library) and pushes chunks as SSE; Next.js frontend connects to that SSE endpoint and renders streaming text in a three-column layout skeleton. Sessions and messages are persisted to Supabase Postgres.

**Tech Stack:** Python 3.14 + FastAPI + litellm + supabase-py | Next.js 14 App Router + TypeScript + Tailwind CSS + Zustand + native EventSource/fetch

---

## File Map

### Backend (new files)
| File | Responsibility |
|------|---------------|
| `backend/requirements.txt` | Python deps |
| `backend/main.py` | FastAPI app, CORS, router registration |
| `backend/models/session.py` | Pydantic models: Session, CreateSessionRequest |
| `backend/models/thread.py` | Pydantic models: Thread, CreateThreadRequest |
| `backend/models/message.py` | Pydantic models: Message, ChatRequest |
| `backend/db/schema.sql` | Supabase schema (sessions, threads, messages) |
| `backend/db/supabase.py` | Supabase async client singleton |
| `backend/services/llm_client.py` | litellm wrapper: chat_stream(), pick_model() |
| `backend/routers/sessions.py` | POST /api/sessions, GET /api/sessions/{id} |
| `backend/routers/threads.py` | POST /api/threads, GET /api/threads/{id}/messages |
| `backend/routers/stream.py` | POST /api/threads/{id}/chat → SSE StreamingResponse |
| `backend/tests/test_stream.py` | httpx AsyncClient tests for SSE endpoint |

### Frontend (new project under `frontend/`)
| File | Responsibility |
|------|---------------|
| `frontend/` | Created by `create-next-app` (App Router, TS, Tailwind) |
| `frontend/.env.local` | NEXT_PUBLIC_API_URL, Supabase public vars |
| `frontend/app/page.tsx` | Landing: create session → redirect to /chat/[id] |
| `frontend/app/chat/[sessionId]/page.tsx` | Three-column chat shell |
| `frontend/components/MainThread/MessageList.tsx` | Scrollable message history |
| `frontend/components/MainThread/MessageBubble.tsx` | Single message (user/assistant) |
| `frontend/components/MainThread/InputBar.tsx` | Textarea + send button, tied to active thread |
| `frontend/stores/useSessionStore.ts` | Zustand: sessionId, init/load session |
| `frontend/stores/useThreadStore.ts` | Zustand: thread tree, active thread id |
| `frontend/stores/useStreamStore.ts` | Zustand: per-thread streaming buffer |
| `frontend/lib/api.ts` | fetch wrappers: createSession, createThread, sendChat |
| `frontend/lib/sse.ts` | openSSEStream(threadId, onChunk, onDone, onError) |

---

## Task 1: Supabase Schema

**Files:**
- Create: `backend/db/schema.sql`

- [ ] **Step 1: Write schema.sql**

```sql
-- backend/db/schema.sql
create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  parent_thread_id uuid references threads(id) on delete cascade,  -- null = main thread
  anchor_text text,
  anchor_message_id uuid,  -- FK added after messages table; see below
  depth int not null default 0,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  token_count int,
  created_at timestamptz default now()
);

create table if not exists thread_summaries (
  thread_id uuid primary key references threads(id) on delete cascade,
  summary text not null,
  token_budget int not null,
  updated_at timestamptz default now()
);

-- Add FK from threads.anchor_message_id → messages.id (separate because of ordering)
alter table threads
  add constraint fk_anchor_message
  foreign key (anchor_message_id)
  references messages(id)
  on delete set null;
```

- [ ] **Step 2: Apply schema in Supabase SQL editor**

Open Supabase dashboard → SQL Editor → paste schema.sql → Run.  
Expected: all tables created with no errors.

Alternatively via CLI (if `supabase` CLI is installed):
```bash
cd /Users/Mac/workspace/deeppin
supabase db push
```

- [ ] **Step 3: Verify tables exist**

In Supabase dashboard → Table Editor, confirm: `sessions`, `threads`, `messages`, `thread_summaries` all visible.

---

## Task 2: Backend — Foundation

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/db/supabase.py`
- Create: `backend/.python-version` (optional, for pyenv)

- [ ] **Step 1: Create requirements.txt**

```
# backend/requirements.txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-dotenv==1.0.1
pydantic==2.10.4
litellm==1.57.4
supabase==2.10.0
httpx==0.28.1
pytest==8.3.4
pytest-asyncio==0.25.2
anyio==4.8.0
```

- [ ] **Step 2: Create virtual environment and install**

```bash
cd /Users/Mac/workspace/deeppin/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 3: Create backend/db/__init__.py and backend/db/supabase.py**

```python
# backend/db/__init__.py
```

```python
# backend/db/supabase.py
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client
```

- [ ] **Step 4: Create package __init__ files**

```bash
touch /Users/Mac/workspace/deeppin/backend/routers/__init__.py
touch /Users/Mac/workspace/deeppin/backend/services/__init__.py
touch /Users/Mac/workspace/deeppin/backend/models/__init__.py
touch /Users/Mac/workspace/deeppin/backend/tests/__init__.py
```

- [ ] **Step 5: Create main.py**

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import sessions, threads, stream

app = FastAPI(title="Deeppin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/api")
app.include_router(threads.router, prefix="/api")
app.include_router(stream.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Test health endpoint**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000 &
sleep 2
curl http://localhost:8000/health
```

Expected output: `{"status":"ok"}`

Kill background server after verification: `pkill -f "uvicorn main:app"`

- [ ] **Step 7: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/requirements.txt backend/main.py backend/db/ backend/routers/__init__.py backend/services/__init__.py backend/models/__init__.py backend/tests/__init__.py
git commit -m "feat: backend foundation — FastAPI app + Supabase client"
```

---

## Task 3: Pydantic Models

**Files:**
- Create: `backend/models/session.py`
- Create: `backend/models/thread.py`
- Create: `backend/models/message.py`

- [ ] **Step 1: Write models**

```python
# backend/models/session.py
from pydantic import BaseModel
from datetime import datetime
import uuid


class CreateSessionRequest(BaseModel):
    title: str | None = None


class Session(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
```

```python
# backend/models/thread.py
from pydantic import BaseModel
from datetime import datetime
import uuid


class CreateThreadRequest(BaseModel):
    session_id: uuid.UUID
    parent_thread_id: uuid.UUID | None = None
    anchor_text: str | None = None
    anchor_message_id: uuid.UUID | None = None


class Thread(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    parent_thread_id: uuid.UUID | None
    anchor_text: str | None
    depth: int
    created_at: datetime
```

```python
# backend/models/message.py
from pydantic import BaseModel
from datetime import datetime
import uuid


class ChatRequest(BaseModel):
    content: str


class Message(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    role: str
    content: str
    token_count: int | None
    created_at: datetime
```

- [ ] **Step 2: Verify imports work**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -c "from models.session import Session; from models.thread import Thread; from models.message import Message; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/models/
git commit -m "feat: Pydantic models for session, thread, message"
```

---

## Task 4: LLM Client Service

**Files:**
- Create: `backend/services/llm_client.py`
- Create: `backend/tests/test_llm_client.py`

The client selects a provider based on which API keys are available in env. Priority: Anthropic → DeepSeek → Gemini.

- [ ] **Step 1: Write test first**

```python
# backend/tests/test_llm_client.py
import pytest
import asyncio
from services.llm_client import pick_model


def test_pick_model_returns_string():
    """pick_model() always returns a non-empty string."""
    model = pick_model()
    assert isinstance(model, str)
    assert len(model) > 0


def test_pick_model_format():
    """pick_model() returns provider/model format."""
    model = pick_model()
    assert "/" in model, f"Expected 'provider/model' format, got: {model}"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_llm_client.py -v
```

Expected: FAIL with `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Implement llm_client.py**

```python
# backend/services/llm_client.py
import os
import json
import asyncio
from typing import AsyncGenerator
import litellm

# 关闭 litellm 的 verbose 日志
litellm.set_verbose = False


def pick_model() -> str:
    """根据可用的 API key 选择 provider。优先级：Anthropic > DeepSeek > Gemini > Cerebras"""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic/claude-sonnet-4-6"
    if os.environ.get("DEEPSEEK_API_KEY"):
        return "deepseek/deepseek-chat"
    gemini_keys = _load_key_list("GEMINI_API_KEYS")
    if gemini_keys:
        os.environ["GEMINI_API_KEY"] = gemini_keys[0]
        return "gemini/gemini-2.0-flash"
    cerebras_keys = _load_key_list("CEREBRAS_API_KEYS")
    if cerebras_keys:
        os.environ["CEREBRAS_API_KEY"] = cerebras_keys[0]
        return "cerebras/llama-3.3-70b"
    raise RuntimeError("没有可用的 AI API key，请在 backend/.env 中配置至少一个")


def _load_key_list(env_var: str) -> list[str]:
    """从环境变量中解析 JSON 数组格式的 key 列表"""
    raw = os.environ.get(env_var, "")
    if not raw:
        return []
    try:
        keys = json.loads(raw)
        return [k for k in keys if k]
    except json.JSONDecodeError:
        # 单个 key 直接返回
        return [raw] if raw else []


async def chat_stream(
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    向 AI 发送消息并以 AsyncGenerator 形式逐块返回文字。
    messages 格式：[{"role": "user"|"assistant"|"system", "content": str}]
    """
    model = pick_model()

    # 为 DeepSeek 设置 base_url（litellm 需要）
    kwargs: dict = {"model": model, "messages": messages, "stream": True}

    response = await litellm.acompletion(**kwargs)

    async for chunk in response:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_llm_client.py -v
```

Expected: PASS (both tests)

- [ ] **Step 5: Quick live smoke test (optional — costs one API call)**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -c "
import asyncio
from dotenv import load_dotenv
load_dotenv()
from services.llm_client import chat_stream

async def test():
    async for chunk in chat_stream([{'role': 'user', 'content': 'Say hello in 5 words.'}]):
        print(chunk, end='', flush=True)
    print()

asyncio.run(test())
"
```

Expected: a short greeting printed word-by-word.

- [ ] **Step 6: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/services/llm_client.py backend/tests/test_llm_client.py
git commit -m "feat: LLM client with provider auto-selection and async streaming"
```

---

## Task 5: Sessions Router

**Files:**
- Create: `backend/routers/sessions.py`
- Create: `backend/tests/test_sessions.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_sessions.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
import uuid
from datetime import datetime, timezone


@pytest.fixture
def mock_supabase():
    """Mock Supabase so tests don't hit the real DB."""
    session_id = str(uuid.uuid4())
    fake_session = {
        "id": session_id,
        "title": "Test",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    mock = MagicMock()
    mock.table.return_value.insert.return_value.execute.return_value.data = [fake_session]
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_session
    return mock, fake_session


@pytest.mark.asyncio
async def test_create_session(mock_supabase):
    mock, fake_session = mock_supabase
    with patch("routers.sessions.get_supabase", return_value=mock):
        from main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/sessions", json={"title": "Test"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == fake_session["id"]


@pytest.mark.asyncio
async def test_get_session(mock_supabase):
    mock, fake_session = mock_supabase
    with patch("routers.sessions.get_supabase", return_value=mock):
        from main import app
        session_id = fake_session["id"]
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_sessions.py -v
```

Expected: FAIL — `routers.sessions` doesn't exist yet.

- [ ] **Step 3: Implement sessions router**

```python
# backend/routers/sessions.py
from fastapi import APIRouter, HTTPException
from models.session import CreateSessionRequest, Session
from db.supabase import get_supabase
import uuid

router = APIRouter()


@router.post("/sessions", response_model=Session)
async def create_session(req: CreateSessionRequest):
    db = get_supabase()
    result = db.table("sessions").insert({"title": req.title}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    return result.data[0]


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: uuid.UUID):
    db = get_supabase()
    result = (
        db.table("sessions")
        .select("*")
        .eq("id", str(session_id))
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return result.data
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_sessions.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/routers/sessions.py backend/tests/test_sessions.py
git commit -m "feat: sessions API — create and get session"
```

---

## Task 6: Threads Router

**Files:**
- Create: `backend/routers/threads.py`
- Create: `backend/tests/test_threads.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_threads.py
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock
import uuid
from datetime import datetime, timezone


def make_mock_thread(session_id: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "parent_thread_id": None,
        "anchor_text": None,
        "anchor_message_id": None,
        "depth": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.mark.asyncio
async def test_create_thread():
    session_id = str(uuid.uuid4())
    fake_thread = make_mock_thread(session_id)
    mock = MagicMock()
    mock.table.return_value.insert.return_value.execute.return_value.data = [fake_thread]
    with patch("routers.threads.get_supabase", return_value=mock):
        from main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/threads", json={"session_id": session_id})
    assert resp.status_code == 200
    assert resp.json()["session_id"] == session_id


@pytest.mark.asyncio
async def test_get_thread_messages():
    thread_id = str(uuid.uuid4())
    fake_msgs = [
        {
            "id": str(uuid.uuid4()),
            "thread_id": thread_id,
            "role": "user",
            "content": "hello",
            "token_count": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ]
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = fake_msgs
    with patch("routers.threads.get_supabase", return_value=mock):
        from main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/threads/{thread_id}/messages")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["content"] == "hello"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_threads.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement threads router**

```python
# backend/routers/threads.py
from fastapi import APIRouter, HTTPException
from models.thread import CreateThreadRequest, Thread
from models.message import Message
from db.supabase import get_supabase
import uuid

router = APIRouter()


@router.post("/threads", response_model=Thread)
async def create_thread(req: CreateThreadRequest):
    db = get_supabase()
    payload: dict = {
        "session_id": str(req.session_id),
        "depth": 0 if req.parent_thread_id is None else _get_depth(str(req.parent_thread_id)) + 1,
    }
    if req.parent_thread_id:
        payload["parent_thread_id"] = str(req.parent_thread_id)
    if req.anchor_text:
        payload["anchor_text"] = req.anchor_text
    if req.anchor_message_id:
        payload["anchor_message_id"] = str(req.anchor_message_id)

    result = db.table("threads").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create thread")
    return result.data[0]


def _get_depth(parent_thread_id: str) -> int:
    """親スレッドの depth を取得する（ネスト計算用）"""
    db = get_supabase()
    result = (
        db.table("threads")
        .select("depth")
        .eq("id", parent_thread_id)
        .single()
        .execute()
    )
    return result.data["depth"] if result.data else 0


@router.get("/threads/{thread_id}/messages", response_model=list[Message])
async def get_thread_messages(thread_id: uuid.UUID):
    db = get_supabase()
    result = (
        db.table("messages")
        .select("*")
        .eq("thread_id", str(thread_id))
        .order("created_at")
        .execute()
    )
    return result.data or []
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_threads.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/routers/threads.py backend/tests/test_threads.py
git commit -m "feat: threads API — create thread and get messages"
```

---

## Task 7: SSE Stream Endpoint ⭐

**Files:**
- Create: `backend/routers/stream.py`
- Create: `backend/tests/test_stream.py`

This is the core of Day 1. POST `/api/threads/{id}/chat` saves the user message and returns an SSE `StreamingResponse` that streams the AI reply chunk-by-chunk, then saves the full reply to DB.

SSE format per chunk:
```
data: {"type":"chunk","content":"hello"}\n\n
```
Final event:
```
data: {"type":"done","messageId":"<uuid>"}\n\n
```

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_stream.py
import pytest
import json
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
import uuid
from datetime import datetime, timezone


def make_fake_message(thread_id: str, role: str, content: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "role": role,
        "content": content,
        "token_count": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def fake_stream(chunks: list[str]):
    for c in chunks:
        yield c


@pytest.mark.asyncio
async def test_chat_returns_sse_content_type():
    """POST /api/threads/:id/chat should return text/event-stream."""
    thread_id = str(uuid.uuid4())
    mock_db = MagicMock()
    fake_user_msg = make_fake_message(thread_id, "user", "hello")
    fake_ai_msg = make_fake_message(thread_id, "assistant", "hi there")
    mock_db.table.return_value.insert.return_value.execute.return_value.data = [fake_user_msg]
    mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [fake_user_msg]
    # Second insert for AI message
    mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [fake_ai_msg]

    async def mock_chat_stream(messages):
        for c in ["hi ", "there"]:
            yield c

    with patch("routers.stream.get_supabase", return_value=mock_db), \
         patch("routers.stream.chat_stream", side_effect=mock_chat_stream):
        from main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            async with client.stream("POST", f"/api/threads/{thread_id}/chat", json={"content": "hello"}) as resp:
                assert resp.status_code == 200
                assert "text/event-stream" in resp.headers["content-type"]
                body = await resp.aread()

    lines = body.decode().strip().split("\n")
    data_lines = [l for l in lines if l.startswith("data:")]
    assert len(data_lines) >= 2  # at least one chunk + done

    last_event = json.loads(data_lines[-1][len("data:"):].strip())
    assert last_event["type"] == "done"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_stream.py -v
```

Expected: FAIL — `routers.stream` missing

- [ ] **Step 3: Implement stream router**

```python
# backend/routers/stream.py
import json
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.message import ChatRequest
from db.supabase import get_supabase
from services.llm_client import chat_stream

router = APIRouter()


@router.post("/threads/{thread_id}/chat")
async def chat(thread_id: uuid.UUID, req: ChatRequest):
    """
    사용자 메시지를 저장하고 AI 응답을 SSE 스트림으로 반환.
    SSE 이벤트 형식:
      data: {"type":"chunk","content":"..."}
      data: {"type":"done","messageId":"..."}
      data: {"type":"error","detail":"..."}
    """
    db = get_supabase()

    # 1. 유저 메시지 저장
    user_msg_result = db.table("messages").insert({
        "thread_id": str(thread_id),
        "role": "user",
        "content": req.content,
    }).execute()

    if not user_msg_result.data:
        raise HTTPException(status_code=500, detail="Failed to save user message")

    # 2. 현재 스레드 메시지 히스토리 가져오기 (context 구성)
    history_result = (
        db.table("messages")
        .select("role, content")
        .eq("thread_id", str(thread_id))
        .order("created_at")
        .execute()
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in (history_result.data or [])]

    async def event_generator():
        full_content = []
        ai_message_id = str(uuid.uuid4())

        try:
            async for chunk in chat_stream(messages):
                full_content.append(chunk)
                event = json.dumps({"type": "chunk", "content": chunk}, ensure_ascii=False)
                yield f"data: {event}\n\n"

            # 완료 후 AI 메시지를 DB에 저장
            complete_text = "".join(full_content)
            ai_result = db.table("messages").insert({
                "id": ai_message_id,
                "thread_id": str(thread_id),
                "role": "assistant",
                "content": complete_text,
            }).execute()

            if ai_result.data:
                ai_message_id = ai_result.data[0]["id"]

            done_event = json.dumps({"type": "done", "messageId": ai_message_id})
            yield f"data: {done_event}\n\n"

        except Exception as e:
            error_event = json.dumps({"type": "error", "detail": str(e)})
            yield f"data: {error_event}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Nginx 버퍼링 비활성화
        },
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/test_stream.py -v
```

Expected: PASS

- [ ] **Step 5: Run all backend tests**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/routers/stream.py backend/tests/test_stream.py
git commit -m "feat: SSE stream endpoint — POST /api/threads/:id/chat"
```

---

## Task 8: Frontend — Next.js Setup

**Files:**
- Create: `frontend/` (via create-next-app)
- Create: `frontend/.env.local`

- [ ] **Step 1: Create Next.js 14 app**

```bash
cd /Users/Mac/workspace/deeppin
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

When prompted:
- Would you like to use Turbopack? → No (specified via `--no-turbopack`)

- [ ] **Step 2: Install additional dependencies**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npm install zustand framer-motion
```

- [ ] **Step 3: Create .env.local**

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- [ ] **Step 4: Verify Next.js starts**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npm run dev &
sleep 4
curl -s http://localhost:3000 | head -5
```

Expected: HTML output with Next.js content.

Kill: `pkill -f "next dev"`

- [ ] **Step 5: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add frontend/
git commit -m "feat: Next.js 14 frontend scaffold with Tailwind + Zustand"
```

---

## Task 9: Zustand Stores

**Files:**
- Create: `frontend/src/stores/useSessionStore.ts`
- Create: `frontend/src/stores/useThreadStore.ts`
- Create: `frontend/src/stores/useStreamStore.ts`

- [ ] **Step 1: Write stores**

```typescript
// frontend/src/stores/useSessionStore.ts
import { create } from "zustand";

interface SessionState {
  sessionId: string | null;
  setSessionId: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
}));
```

```typescript
// frontend/src/stores/useThreadStore.ts
import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Thread {
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  anchorText: string | null;
  depth: number;
  messages: Message[];
}

interface ThreadState {
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  setActiveThread: (id: string) => void;
  addThread: (thread: Thread) => void;
  setMessages: (threadId: string, messages: Message[]) => void;
  appendMessage: (threadId: string, message: Message) => void;
  updateLastAssistantMessage: (threadId: string, content: string) => void;
}

export const useThreadStore = create<ThreadState>((set) => ({
  threads: {},
  activeThreadId: null,

  setActiveThread: (id) => set({ activeThreadId: id }),

  addThread: (thread) =>
    set((state) => ({
      threads: { ...state.threads, [thread.id]: thread },
    })),

  setMessages: (threadId, messages) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: { ...state.threads[threadId], messages },
      },
    })),

  appendMessage: (threadId, message) =>
    set((state) => {
      const thread = state.threads[threadId];
      if (!thread) return state;
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...thread,
            messages: [...thread.messages, message],
          },
        },
      };
    }),

  updateLastAssistantMessage: (threadId, content) =>
    set((state) => {
      const thread = state.threads[threadId];
      if (!thread) return state;
      const messages = [...thread.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        messages[lastIdx] = { ...messages[lastIdx], content };
      }
      return {
        threads: {
          ...state.threads,
          [threadId]: { ...thread, messages },
        },
      };
    }),
}));
```

```typescript
// frontend/src/stores/useStreamStore.ts
import { create } from "zustand";

interface StreamState {
  // threadId → 현재 스트리밍 중인지 여부
  streaming: Record<string, boolean>;
  setStreaming: (threadId: string, isStreaming: boolean) => void;
  isStreaming: (threadId: string) => boolean;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streaming: {},
  setStreaming: (threadId, isStreaming) =>
    set((state) => ({
      streaming: { ...state.streaming, [threadId]: isStreaming },
    })),
  isStreaming: (threadId) => get().streaming[threadId] ?? false,
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add frontend/src/stores/
git commit -m "feat: Zustand stores for session, thread tree, and stream state"
```

---

## Task 10: API Client + SSE Library

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/sse.ts`

- [ ] **Step 1: Write api.ts**

```typescript
// frontend/src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface SessionResponse {
  id: string;
  title: string | null;
  created_at: string;
}

export interface ThreadResponse {
  id: string;
  session_id: string;
  parent_thread_id: string | null;
  anchor_text: string | null;
  depth: number;
  created_at: string;
}

export interface MessageResponse {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  token_count: number | null;
  created_at: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<T>;
}

export async function createSession(title?: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title: title ?? null }),
  });
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>(`/api/sessions/${sessionId}`);
}

export async function createThread(payload: {
  session_id: string;
  parent_thread_id?: string;
  anchor_text?: string;
  anchor_message_id?: string;
}): Promise<ThreadResponse> {
  return apiFetch<ThreadResponse>("/api/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getThreadMessages(
  threadId: string
): Promise<MessageResponse[]> {
  return apiFetch<MessageResponse[]>(`/api/threads/${threadId}/messages`);
}

/** sendChat — POST /api/threads/:id/chat, returns raw Response for SSE streaming */
export async function sendChat(
  threadId: string,
  content: string
): Promise<Response> {
  const resp = await fetch(`${API_URL}/api/threads/${threadId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!resp.ok) {
    throw new Error(`sendChat failed (${resp.status})`);
  }
  return resp;
}
```

- [ ] **Step 2: Write sse.ts**

```typescript
// frontend/src/lib/sse.ts

interface SSEChunkEvent {
  type: "chunk";
  content: string;
}
interface SSEDoneEvent {
  type: "done";
  messageId: string;
}
interface SSEErrorEvent {
  type: "error";
  detail: string;
}
type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

export async function openSSEStream(
  threadId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: (messageId: string) => void,
  onError: (detail: string) => void
): Promise<void> {
  const { sendChat } = await import("./api");
  const resp = await sendChat(threadId, content);

  const reader = resp.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE는 \n\n으로 이벤트 구분
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;

      const jsonStr = line.slice("data:".length).trim();
      try {
        const event = JSON.parse(jsonStr) as SSEEvent;
        if (event.type === "chunk") onChunk(event.content);
        else if (event.type === "done") onDone(event.messageId);
        else if (event.type === "error") onError(event.detail);
      } catch {
        // 파싱 실패 시 무시
      }
    }
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add frontend/src/lib/
git commit -m "feat: API client and SSE streaming library"
```

---

## Task 11: Chat Components

**Files:**
- Create: `frontend/src/components/MainThread/MessageBubble.tsx`
- Create: `frontend/src/components/MainThread/MessageList.tsx`
- Create: `frontend/src/components/MainThread/InputBar.tsx`

- [ ] **Step 1: Write MessageBubble**

```tsx
// frontend/src/components/MainThread/MessageBubble.tsx
"use client";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function MessageBubble({ role, content, isStreaming }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-zinc-800 text-zinc-100 border border-zinc-700"
        }`}
      >
        {content}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-1 align-middle" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write MessageList**

```tsx
// frontend/src/components/MainThread/MessageList.tsx
"use client";

import { useEffect, useRef } from "react";
import { useThreadStore } from "@/stores/useThreadStore";
import { useStreamStore } from "@/stores/useStreamStore";
import MessageBubble from "./MessageBubble";

interface Props {
  threadId: string;
}

export default function MessageList({ threadId }: Props) {
  const messages = useThreadStore((s) => s.threads[threadId]?.messages ?? []);
  const isStreaming = useStreamStore((s) => s.isStreaming(threadId));
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 올 때마다 스크롤 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        Start a conversation…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id}
          role={msg.role}
          content={msg.content}
          isStreaming={
            isStreaming && idx === messages.length - 1 && msg.role === "assistant"
          }
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Write InputBar**

```tsx
// frontend/src/components/MainThread/InputBar.tsx
"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useStreamStore } from "@/stores/useStreamStore";

interface Props {
  threadId: string;
  onSend: (content: string) => void;
}

export default function InputBar({ threadId, onSend }: Props) {
  const [value, setValue] = useState("");
  const isStreaming = useStreamStore((s) => s.isStreaming(threadId));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
    // 높이 리셋
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-end gap-2 bg-zinc-800 rounded-xl px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-zinc-100 text-sm resize-none outline-none placeholder-zinc-500 max-h-40 overflow-y-auto disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || isStreaming}
          className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add frontend/src/components/
git commit -m "feat: MessageBubble, MessageList, InputBar components"
```

---

## Task 12: Pages — Home + Chat

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/chat/[sessionId]/page.tsx`

- [ ] **Step 1: Write home page (creates session → redirect)**

```tsx
// frontend/src/app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession, createThread } from "@/lib/api";
import { useSessionStore } from "@/stores/useSessionStore";
import { useThreadStore } from "@/stores/useThreadStore";

export default function HomePage() {
  const router = useRouter();
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const addThread = useThreadStore((s) => s.addThread);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  useEffect(() => {
    async function init() {
      const session = await createSession("New Chat");
      setSessionId(session.id);

      const mainThread = await createThread({ session_id: session.id });
      addThread({
        id: mainThread.id,
        sessionId: mainThread.session_id,
        parentThreadId: mainThread.parent_thread_id,
        anchorText: mainThread.anchor_text,
        depth: mainThread.depth,
        messages: [],
      });
      setActiveThread(mainThread.id);

      router.push(`/chat/${session.id}?threadId=${mainThread.id}`);
    }
    init();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-zinc-400 text-sm animate-pulse">Initializing…</div>
    </div>
  );
}
```

- [ ] **Step 2: Write chat page**

```tsx
// frontend/src/app/chat/[sessionId]/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useThreadStore } from "@/stores/useThreadStore";
import { useStreamStore } from "@/stores/useStreamStore";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import { openSSEStream } from "@/lib/sse";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId") ?? "";

  const appendMessage = useThreadStore((s) => s.appendMessage);
  const updateLastAssistantMessage = useThreadStore(
    (s) => s.updateLastAssistantMessage
  );
  const setStreaming = useStreamStore((s) => s.setStreaming);

  const handleSend = async (content: string) => {
    if (!threadId) return;

    // 낙관적 업데이트: 유저 메시지 즉시 표시
    appendMessage(threadId, {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    });

    // 빈 assistant 메시지 placeholder 추가 (스트리밍 중 채워짐)
    appendMessage(threadId, {
      id: `temp-ai-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    });

    setStreaming(threadId, true);

    await openSSEStream(
      threadId,
      content,
      (chunk) => {
        // 마지막 assistant 메시지에 청크 추가
        const thread = useThreadStore.getState().threads[threadId];
        if (!thread) return;
        const lastMsg = thread.messages[thread.messages.length - 1];
        updateLastAssistantMessage(threadId, lastMsg.content + chunk);
      },
      (_messageId) => {
        setStreaming(threadId, false);
      },
      (detail) => {
        console.error("SSE error:", detail);
        setStreaming(threadId, false);
      }
    );
  };

  if (!threadId) {
    return (
      <div className="text-zinc-400 text-sm p-8">No thread selected.</div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* 三栏布局骨架（Day 1: 중앙 컬럼만 활성, 좌우는 placeholder） */}
      <div className="flex flex-1 min-h-0">
        {/* 왼쪽 서브스레드 컬럼 */}
        <aside className="w-72 border-r border-zinc-800 bg-zinc-900 hidden lg:flex items-center justify-center text-zinc-600 text-xs">
          Pins (left)
        </aside>

        {/* 중앙 메인 스레드 */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* 헤더 */}
          <header className="h-12 border-b border-zinc-800 flex items-center px-4 text-sm font-medium text-zinc-300 shrink-0">
            Deeppin
          </header>

          <MessageList threadId={threadId} />
          <InputBar threadId={threadId} onSend={handleSend} />
        </main>

        {/* 오른쪽 서브스레드 컬럼 */}
        <aside className="w-72 border-l border-zinc-800 bg-zinc-900 hidden lg:flex items-center justify-center text-zinc-600 text-xs">
          Pins (right)
        </aside>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
```

- [ ] **Step 3: Update global CSS for dark background**

Edit `frontend/src/app/globals.css` — ensure body background is dark. Replace the default Tailwind directives with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  @apply bg-zinc-950 text-zinc-100;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add frontend/src/app/
git commit -m "feat: home page session init + three-column chat page shell"
```

---

## Task 13: pytest Configuration

**Files:**
- Create: `backend/pytest.ini`

- [ ] **Step 1: Create pytest.ini**

```ini
# backend/pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

- [ ] **Step 2: Run full backend test suite**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/Mac/workspace/deeppin
git add backend/pytest.ini
git commit -m "chore: pytest asyncio config"
```

---

## Task 14: End-to-End Smoke Test

Manual verification that the full stack works in a browser.

- [ ] **Step 1: Start backend**

```bash
cd /Users/Mac/workspace/deeppin/backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Leave running in a terminal tab.

- [ ] **Step 2: Start frontend**

```bash
cd /Users/Mac/workspace/deeppin/frontend
npm run dev
```

Leave running in a second terminal tab.

- [ ] **Step 3: Open browser**

Navigate to `http://localhost:3000`.

Expected flow:
1. Home page shows "Initializing…" briefly
2. Redirects to `/chat/<sessionId>?threadId=<threadId>`
3. Three-column layout visible (left/right sidebars on wide screen)
4. Type a message in the InputBar, press Enter
5. Message appears in the message list
6. AI response streams in word-by-word (blinking cursor visible while streaming)
7. Streaming cursor disappears when response completes

- [ ] **Step 4: Check backend logs**

In the backend terminal, verify:
- `POST /api/sessions 200`
- `POST /api/threads 200`
- `POST /api/threads/<id>/chat 200`

- [ ] **Step 5: Final commit**

```bash
cd /Users/Mac/workspace/deeppin
git add -A
git commit -m "feat: Day 1 complete — full-stack streaming AI chat"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] FastAPI backend scaffold → Tasks 2–7
- [x] Next.js 14 App Router frontend → Tasks 8–12
- [x] SSE streaming → Task 7 (backend) + Task 10 sse.ts + Task 12 chat page
- [x] Supabase persistence (sessions, threads, messages) → Task 1 schema + Tasks 5–7
- [x] Three-column layout skeleton → Task 12
- [x] Main-thread AI conversation → Tasks 7, 12
- [x] Zustand state management → Task 9
- [x] Anonymous session (no auth) → confirmed, no auth tables

**MVP exclusions honored:**
- No user auth system — only anonymous sessions
- No LiteLLM proxy — using litellm library directly
- No pin/sub-thread UI (Day 2)
- No context builder (Day 3)
- No merge output (Day 4)

**Type consistency:**
- `Thread.messages: Message[]` used in `useThreadStore` matches `Message` interface
- `openSSEStream(threadId, content, ...)` signature consistent across sse.ts and chat page usage
- `appendMessage` / `updateLastAssistantMessage` signatures consistent

**Notes:**
- `ANTHROPIC_API_KEY` is empty in .env — backend will auto-select DeepSeek (key present) via `pick_model()`
- GROQ keys in .env start with `xai-` prefix which is xAI/Grok format, not Groq — these will fail if used; `pick_model()` selects DeepSeek first so this is safe for now
