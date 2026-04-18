-- backend/db/migrations/009_flatten_session.sql
-- 扁平化功能：把 session 下所有子线程合并回主线，按 preorder 排序
-- Flatten feature: collapse all sub-threads of a session back into the main thread, ordered by preorder DFS.
--
-- threads.status:
--   'active'    — 默认，正常线程
--   'flattened' — 已被扁平化吸收的子线程（tombstone，仅作审计；其消息已迁移到主线）
--                 Sub-thread that has been absorbed by flatten (tombstone for audit; messages moved to main)
--
-- messages.position:
--   null  — 未参与扁平化（默认状态）/ Not part of any flatten yet
--   int   — preorder 序号（同一主线内单调递增）/ Preorder index, monotonic within the main thread
--
-- 扁平化是不可逆操作 / Flatten is irreversible.

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'flattened'));

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS position int;

-- 主线消息查询走 (thread_id, position) 索引，position null 时回落到 created_at
-- Main-thread queries use (thread_id, position); falls back to created_at when position is null
CREATE INDEX IF NOT EXISTS idx_messages_thread_position
  ON messages(thread_id, position)
  WHERE position IS NOT NULL;


-- ── flatten_session RPC ─────────────────────────────────────────────────
-- 在单个事务里完成两件事：
--   1) 按 preorder 列表批量重写 messages（thread_id 指向主线 + position 赋值）
--   2) 把 session 下所有非主线 active threads 标记为 flattened
-- preorder 计算放在应用层（Python），便于单测；SQL 只负责原子写入。
--
-- Atomically performs two things in a single transaction:
--   1) Bulk rewrites messages from a preorder list (thread_id → main, position assigned)
--   2) Marks all non-main active threads in the session as flattened
-- Preorder computation lives in the application layer (Python) for testability;
-- SQL only handles the atomic write.
--
-- 参数 / Args:
--   p_session_id      session UUID
--   p_main_thread_id  主线 thread UUID（depth=0 / parent_thread_id IS NULL）
--   p_message_orders  jsonb 数组，每个元素 {"id": "<uuid>", "position": <int>}
--                     Array of {"id": "<uuid>", "position": <int>}
-- 返回值 / Returns: 实际更新的 messages 行数 / Number of message rows updated
--
-- SECURITY INVOKER 保证 RLS 仍然生效（按调用者身份判断行级权限）
-- SECURITY INVOKER ensures RLS is still enforced (row-level checks against caller identity)

CREATE OR REPLACE FUNCTION flatten_session(
  p_session_id uuid,
  p_main_thread_id uuid,
  p_message_orders jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  -- 批量重写 messages
  -- Bulk rewrite messages in one statement
  WITH ord AS (
    SELECT
      (elem->>'id')::uuid       AS id,
      (elem->>'position')::int  AS pos
    FROM jsonb_array_elements(p_message_orders) AS elem
  )
  UPDATE messages m
     SET thread_id = p_main_thread_id,
         position  = ord.pos
    FROM ord
   WHERE m.id = ord.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 把所有非主线的 active 子线程标记为 flattened
  -- Mark all non-main active sub-threads as flattened
  UPDATE threads
     SET status = 'flattened'
   WHERE session_id = p_session_id
     AND id <> p_main_thread_id
     AND status = 'active';

  RETURN v_updated;
END;
$$;
