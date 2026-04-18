-- backend/db/migrations/008_anon_trial.sql
-- 匿名用户试用额度 + 过期清理
-- Anonymous-user trial quota + expiration cleanup.
--
-- 产品约束 / Product constraints:
--   - 匿名用户最多 1 个 session（前端不给新建入口，登录才能开）
--     Anonymous users get at most 1 session (UI hides the "new chat" button).
--   - 匿名用户生命期最多 20 轮对话（所有线程累加）
--     Anonymous users have a lifetime cap of 20 turns across all threads.
--   - 登录/转正后无限制
--     No limit once linked to a real identity.
--
-- 实现 / Implementation:
--   - sessions.turn_count：每存一条 user message 后台原子 +1
--     sessions.turn_count: atomically +1 after each persisted user message.
--   - 后端在匿名用户 turn_count ≥ 20 时返回结构化 402 错误
--     Backend returns a structured 402 when is_anonymous AND turn_count ≥ 20.
--   - pg_cron 每日清理 7 天未活跃的匿名用户（CASCADE 自动带走 session/thread/message）
--     pg_cron daily: delete anonymous users with no activity in 7 days; CASCADE handles downstream rows.

-- ── 1. sessions 加 turn_count ─────────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS turn_count int NOT NULL DEFAULT 0;

-- ── 2. 原子递增 RPC ───────────────────────────────────────────────────
-- 避免 "读-改-写" 两步的竞态：并发两条 user message 可能同时读到 19，各自写 20 → 上限失效。
-- RPC 用 UPDATE ... RETURNING 一步到位；同时返回新值给 caller 做 gate 判断。
-- Avoids the read-modify-write race where two concurrent inserts both read 19
-- and each write 20. UPDATE ... RETURNING is atomic; the return value also lets
-- callers compare against the quota threshold without a separate read.
CREATE OR REPLACE FUNCTION increment_session_turn_count(p_session_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE sessions
    SET turn_count = turn_count + 1
    WHERE id = p_session_id
    RETURNING turn_count INTO new_count;
  RETURN new_count;
END;
$$;

-- ── 3. pg_cron 清理匿名过期用户 ───────────────────────────────────────
-- pg_cron 在 Supabase 上是 extension，生产环境已启用；dev 环境若无则 CREATE IF NOT EXISTS。
-- pg_cron is a Supabase extension (pre-enabled in prod); local dev gets the CREATE IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 删除策略：is_anonymous=true AND 所有 session 的 created_at 都 > 7 天前
-- （last_sign_in_at 不可靠：匿名 JWT 续期时 Supabase 不一定更新它）。
-- Deletion criteria: is_anonymous=true AND every session's created_at older than 7 days.
-- last_sign_in_at is unreliable — Supabase doesn't always bump it for anon JWT refresh.
CREATE OR REPLACE FUNCTION cleanup_expired_anon_users()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH stale AS (
    SELECT u.id
      FROM auth.users u
      WHERE u.is_anonymous = true
        AND NOT EXISTS (
          SELECT 1 FROM sessions s
            WHERE s.user_id = u.id
              AND s.created_at > (NOW() - INTERVAL '7 days')
        )
  ),
  del AS (
    DELETE FROM auth.users WHERE id IN (SELECT id FROM stale) RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM del;
  RETURN deleted_count;
END;
$$;

-- 每日 03:00 UTC 跑一次（prod 流量谷底）
-- Run daily at 03:00 UTC (off-peak for production).
-- unschedule + schedule 幂等 / unschedule then schedule is idempotent:
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-anon-users');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-expired-anon-users',
  '0 3 * * *',
  $$SELECT cleanup_expired_anon_users()$$
);
