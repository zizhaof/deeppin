# backend/main.py
import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import sessions, threads, stream

# CORS 허용 출처 — 환경 변수에서 읽어 로컬/프로덕션 모두 지원
_raw_origins = os.getenv("ALLOWED_ORIGINS", '["http://localhost:3000"]')
ALLOWED_ORIGINS: list[str] = json.loads(_raw_origins)

app = FastAPI(title="Deeppin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
