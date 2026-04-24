# tests/conftest.py
"""
Common test fixtures and configuration.
"""
import os
import sys
import pytest

# Ensure the backend root is on sys.path so services/models/etc. can be imported directly
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Set minimal env vars to prevent llm_client / supabase from crashing at import time
os.environ.setdefault("GROQ_API_KEYS", '["test-key-1", "test-key-2"]')
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
