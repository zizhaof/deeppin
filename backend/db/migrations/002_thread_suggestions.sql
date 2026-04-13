-- backend/db/migrations/002_thread_suggestions.sql
-- 为 threads 表增加 suggestions 列（子线程建议追问，创建时写入，避免重复 LLM 调用）

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS suggestions jsonb;
