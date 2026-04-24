# backend/main.py
"""
Application entry point for the Deeppin FastAPI backend.

Router registration order: sessions → threads → stream → attachments → search
"""

import os
import json
import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Logging configuration ─────────────────────────────────
# Output to both console (docker logs) and file (persistent, auto-rotates every 7 days)
_log_dir = Path(os.getenv("LOG_DIR", "/app/logs"))
_log_dir.mkdir(parents=True, exist_ok=True)

_formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_file_handler = logging.handlers.TimedRotatingFileHandler(
    filename=_log_dir / "app.log",
    when="midnight",       # rotate at midnight
    backupCount=30,        # keep last 30 days
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
from routers import sessions, threads, stream, attachments, merge, users, health

# Read allowed CORS origins from env var; supports both local dev and production
_raw_origins = os.getenv("ALLOWED_ORIGINS", '["http://localhost:3000"]')
ALLOWED_ORIGINS: list[str] = json.loads(_raw_origins)

_logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    App lifespan: no-op on startup; on shutdown cancel background tasks, close connection pools.
    """
    yield
    from services.stream_manager import cancel_background_tasks
    from services.search_service import close_http_client
    _logger.info("Shutting down: cancelling background tasks…")
    await cancel_background_tasks()
    await close_http_client()
    _logger.info("Shutdown complete.")


app = FastAPI(title="Deeppin API", version="0.1.0", lifespan=lifespan)

# Log critical external dependency config on startup for quick connection diagnosis
from services.search_service import SEARXNG_URL as _SEARXNG_URL
_logger.info("Config: SEARXNG_URL=%s", _SEARXNG_URL)
_logger.info("Config: SUPABASE_URL=%s", os.getenv("SUPABASE_URL", "(not set)"))


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
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
app.include_router(merge.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(health.router)  # /health

# Prometheus metrics ──────────────────────────────
# API layer auto-instrumented; LLM window state exposed via a custom collector.
from prometheus_fastapi_instrumentator import Instrumentator
from services.metrics import register_llm_collector

Instrumentator(
    should_group_status_codes=False,        # Keep precise status codes (200/201/404/500)
    should_ignore_untemplated=True,         # Skip unmatched routes to prevent cardinality explosion
    excluded_handlers=["/metrics", "/health"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

register_llm_collector()
