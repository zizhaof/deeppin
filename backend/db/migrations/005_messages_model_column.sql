-- backend/db/migrations/005_messages_model_column.sql
-- 为 messages 表补充 model 列，记录生成该回复的 LLM 模型（含 provider 前缀）
-- Add `model` column to messages to record the LLM that generated the assistant reply
-- e.g. "groq/llama-3.3-70b-versatile", "cerebras/qwen-3-235b-a22b-instruct-2507"

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS model text;
