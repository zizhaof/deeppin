-- backend/db/migrations/001_add_user_id_rls.sql
-- Migration: add user_id to sessions, enable RLS on all data tables
-- 迁移：sessions 表加 user_id，所有数据表开启 Row Level Security

-- 1. sessions 表加 user_id 列
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 2. sessions RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own sessions" ON sessions;
CREATE POLICY "users see own sessions"
  ON sessions FOR ALL
  USING (user_id = auth.uid());

-- 3. threads RLS（通过 session 归属判断 / ownership via session）
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own threads" ON threads;
CREATE POLICY "users see own threads"
  ON threads FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );

-- 4. messages RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own messages" ON messages;
CREATE POLICY "users see own messages"
  ON messages FOR ALL
  USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.user_id = auth.uid()
    )
  );

-- 5. thread_summaries RLS
ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own summaries" ON thread_summaries;
CREATE POLICY "users see own summaries"
  ON thread_summaries FOR ALL
  USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.user_id = auth.uid()
    )
  );
