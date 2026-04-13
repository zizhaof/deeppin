# backend/db/supabase.py
"""
Supabase 客户端单例
Supabase client singleton.

使用双重检查锁保证线程安全，整个进程只创建一个连接实例。
Uses double-checked locking for thread safety; only one client instance per process.
"""

import os
import threading
from supabase import create_client, Client

_client: Client | None = None
_lock = threading.Lock()


def get_supabase() -> Client:
    """
    获取 Supabase 客户端单例（线程安全的双重检查锁）。
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
