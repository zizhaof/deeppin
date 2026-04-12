# backend/db/supabase.py
import os
import threading
from supabase import create_client, Client

_client: Client | None = None
_lock = threading.Lock()


def get_supabase() -> Client:
    """Supabase 클라이언트 싱글톤 — 스레드 안전 이중 확인 잠금."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                url = os.environ["SUPABASE_URL"]
                key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
                _client = create_client(url, key)
    return _client
