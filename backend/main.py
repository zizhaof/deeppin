# backend/main.py
"""
Deeppin FastAPI 应用入口
Application entry point for the Deeppin FastAPI backend.

路由注册顺序：sessions → threads → stream → attachments → search
Router registration order: sessions → threads → stream → attachments → search
"""

import os
import json
import logging
import logging.handlers
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# ── 日志配置 / Logging configuration ─────────────────────────────────
# 同时输出到控制台（Docker logs）和文件（持久化，7 天自动轮转）
# Output to both console (docker logs) and file (persistent, auto-rotates every 7 days)
_log_dir = Path(os.getenv("LOG_DIR", "/app/logs"))
_log_dir.mkdir(parents=True, exist_ok=True)

_formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_file_handler = logging.handlers.TimedRotatingFileHandler(
    filename=_log_dir / "app.log",
    when="midnight",       # 每天午夜轮转 / rotate at midnight
    backupCount=30,        # 保留最近 30 天 / keep last 30 days
    encoding="utf-8",
)
_file_handler.setFormatter(_formatter)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _console_handler],
)

from fastapi import Request
from fastapi.responses import JSONResponse
from routers import sessions, threads, stream, attachments, search, merge, relevance

# 从环境变量读取允许的跨域来源，同时支持本地开发和生产环境
# Read allowed CORS origins from env var; supports both local dev and production
_raw_origins = os.getenv("ALLOWED_ORIGINS", '["http://localhost:3000"]')
ALLOWED_ORIGINS: list[str] = json.loads(_raw_origins)

_logger = logging.getLogger(__name__)

app = FastAPI(title="Deeppin API", version="0.1.0")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    全局异常兜底：记录未捕获异常，并将真实错误信息返回给前端。
    Global fallback: log unhandled exceptions and return the real error message to the frontend.
    """
    _logger.exception("未处理异常 / Unhandled exception: %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

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
app.include_router(relevance.router, prefix="/api")


@app.get("/health")
async def health():
    # 健康检查端点，供负载均衡器和 CI/CD 探活使用
    # Health check endpoint used by load balancers and CI/CD probes
    return {"status": "ok"}
