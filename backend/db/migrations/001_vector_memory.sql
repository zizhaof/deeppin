-- backend/db/migrations/001_vector_memory.sql
-- 向量记忆系统：附件块 + 对话记忆表，及相似度检索 RPC 函数
-- 在 Supabase SQL 编辑器中执行此文件

-- pgvector 扩展（Supabase 已预装，此处确保启用）
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 附件块表 ─────────────────────────────────────────────────────────
-- 存储用户上传文件解析后的文本块及其向量，按 session 隔离
CREATE TABLE IF NOT EXISTS attachment_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  chunk_index   int  NOT NULL DEFAULT 0,
  content       text NOT NULL,
  embedding     vector(384),        -- paraphrase-multilingual-MiniLM-L12-v2, 384 维
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachment_chunks_session ON attachment_chunks(session_id);

-- ── 对话记忆表 ──────────────────────────────────────────────────────
-- 存储每轮对话的向量化摘要，支持跨轮次、跨子线程语义检索
CREATE TABLE IF NOT EXISTS conversation_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  thread_id   uuid REFERENCES threads(id) ON DELETE CASCADE,
  content     text NOT NULL,        -- "用户：...\nAI：..." 格式的对话摘要
  embedding   vector(384),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_memories_session ON conversation_memories(session_id);

-- ── IVFFlat 向量索引（在数据量 ≥ 1000 行后取消注释并执行） ────────────
-- CREATE INDEX ON attachment_chunks    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
-- CREATE INDEX ON conversation_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ── RPC 函数：检索附件块 ─────────────────────────────────────────────
-- 入参 query_embedding 以文本形式传入（"[0.1,0.2,...]"），函数内 cast 为 vector
CREATE OR REPLACE FUNCTION search_attachment_chunks(
  query_embedding text,
  p_session_id    uuid,
  p_top_k         int  DEFAULT 5,
  p_threshold     float DEFAULT 0.25
)
RETURNS TABLE (
  id         uuid,
  filename   text,
  chunk_index int,
  content    text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    filename,
    chunk_index,
    content,
    1 - (embedding <=> query_embedding::vector(384)) AS similarity
  FROM attachment_chunks
  WHERE session_id = p_session_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding::vector(384)) > p_threshold
  ORDER BY embedding <=> query_embedding::vector(384)
  LIMIT p_top_k;
$$;

-- ── RPC 函数：检索对话记忆 ───────────────────────────────────────────
-- 排除最近 5 秒内写入的记录，避免检索到本轮刚写入的记忆
CREATE OR REPLACE FUNCTION search_conversation_memories(
  query_embedding text,
  p_session_id    uuid,
  p_top_k         int   DEFAULT 3,
  p_threshold     float DEFAULT 0.25
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
    1 - (embedding <=> query_embedding::vector(384)) AS similarity
  FROM conversation_memories
  WHERE session_id = p_session_id
    AND embedding IS NOT NULL
    AND created_at < NOW() - INTERVAL '5 seconds'
    AND 1 - (embedding <=> query_embedding::vector(384)) > p_threshold
  ORDER BY embedding <=> query_embedding::vector(384)
  LIMIT p_top_k;
$$;
