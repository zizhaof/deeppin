-- backend/db/migrations/003_exclude_thread_from_memory.sql
-- 为 search_conversation_memories 增加 p_exclude_thread_id 参数
-- 调用方传入当前线程 ID，排除该线程自身的记忆（已由摘要+原始消息覆盖，避免冗余注入）

CREATE OR REPLACE FUNCTION search_conversation_memories(
  query_embedding      text,
  p_session_id         uuid,
  p_top_k              int   DEFAULT 3,
  p_threshold          float DEFAULT 0.45,
  p_exclude_thread_id  uuid  DEFAULT NULL   -- NULL 表示不排除任何线程
)
RETURNS TABLE (
  id         uuid,
  thread_id  uuid,
  content    text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    thread_id,
    content,
    1 - (embedding <=> query_embedding::vector(1024)) AS similarity
  FROM conversation_memories
  WHERE session_id = p_session_id
    AND embedding IS NOT NULL
    AND created_at < NOW() - INTERVAL '5 seconds'
    AND 1 - (embedding <=> query_embedding::vector(1024)) > p_threshold
    AND (p_exclude_thread_id IS NULL OR thread_id != p_exclude_thread_id)
  ORDER BY embedding <=> query_embedding::vector(1024)
  LIMIT p_top_k;
$$;
