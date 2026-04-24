# backend/db/supabase.py
"""
Supabase client singleton.

Uses double-checked locking for thread safety; only one client instance per process.
"""

import asyncio
import os
import threading
from supabase import create_client, Client

_client: Client | None = None
_lock = threading.Lock()

# Connection-reset error tags.
_CONN_ERR_TAGS = ("Server disconnected", "RemoteProtocolError", "ConnectionReset", "ConnectError")


def get_supabase() -> Client:
    """
    Return the Supabase client singleton using thread-safe double-checked locking.
    """
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                url = os.environ["SUPABASE_URL"]
                key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
                _client = create_client(url, key)
    return _client


def reset_supabase() -> None:
    """
    Clear the singleton so the next get_supabase() call recreates the connection.
    Used for automatic recovery after a 'Server disconnected' error.
    """
    global _client
    with _lock:
        _client = None


async def run_db(fn, *, table: str = "unknown"):
    """
    Canonical Supabase call wrapper: thread-pool execution + connection retry + Prometheus metrics.

    `table` is used as a Prometheus label to break down calls & latency per table.
    """
    from services.metrics import SUPABASE_CALLS, SUPABASE_DURATION
    loop = asyncio.get_running_loop()
    with SUPABASE_DURATION.labels(table).time():
        try:
            result = await loop.run_in_executor(None, fn)
            SUPABASE_CALLS.labels(table, "ok").inc()
            return result
        except Exception as e:
            err_str = str(e)
            err_type = type(e).__name__
            if any(tag in err_str or tag in err_type for tag in _CONN_ERR_TAGS):
                reset_supabase()
                try:
                    result = await loop.run_in_executor(None, fn)
                    SUPABASE_CALLS.labels(table, "ok").inc()
                    return result
                except Exception:
                    SUPABASE_CALLS.labels(table, "error").inc()
                    raise
            SUPABASE_CALLS.labels(table, "error").inc()
            raise
