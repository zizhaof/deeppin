# tests/conftest.py
"""
公共测试夹具和配置
Common test fixtures and configuration.
"""
import os
import sys
import pytest

# 确保 backend 根目录在 sys.path 中，以便直接 import services/models 等
# Ensure the backend root is on sys.path so services/models/etc. can be imported directly
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# 设置最小环境变量，防止 llm_client / supabase 初始化时崩溃
# Set minimal env vars to prevent llm_client / supabase from crashing at import time
os.environ.setdefault("GROQ_API_KEYS", '["test-key-1", "test-key-2"]')
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
