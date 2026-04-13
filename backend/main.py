# backend/main.py
"""
Deeppin FastAPI 应用入口
Application entry point for the Deeppin FastAPI backend.

路由注册顺序：sessions → threads → stream → attachments → search
Router registration order: sessions → threads → stream → attachments → search
"""

import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import sessions, threads, stream, attachments, search, merge

# 从环境变量读取允许的跨域来源，同时支持本地开发和生产环境
# Read allowed CORS origins from env var; supports both local dev and production
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
app.include_router(attachments.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(merge.router, prefix="/api")


@app.get("/health")
async def health():
    # 健康检查端点，供负载均衡器和 CI/CD 探活使用
    # Health check endpoint used by load balancers and CI/CD probes
    return {"status": "ok"}
