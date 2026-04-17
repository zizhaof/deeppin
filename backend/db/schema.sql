-- backend/db/schema.sql
create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  parent_thread_id uuid references threads(id) on delete cascade,  -- null 表示主线
  anchor_text text,
  anchor_message_id uuid,  -- FK 在 messages 表创建后补加，见下方
  anchor_start_offset int,
  anchor_end_offset   int,
  side                text check (side in ('left', 'right')),
  title               text,
  suggestions         jsonb,
  depth int not null default 0 check (depth >= 0),
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  token_count int,
  model text,  -- 生成该消息的 LLM（含 provider 前缀），如 "groq/llama-3.3-70b-versatile"
  created_at timestamptz default now()
);

create table if not exists thread_summaries (
  thread_id uuid primary key references threads(id) on delete cascade,
  summary text not null,
  token_budget int not null,
  updated_at timestamptz default now()
);

-- 查询性能索引
create index if not exists idx_threads_session_id        on threads(session_id);
create index if not exists idx_threads_parent_thread_id  on threads(parent_thread_id);
create index if not exists idx_messages_thread_id        on messages(thread_id);
create index if not exists idx_messages_thread_created   on messages(thread_id, created_at);

-- Add FK from threads.anchor_message_id → messages.id (separate because of ordering)
DO $$ BEGIN
  ALTER TABLE threads
    ADD CONSTRAINT fk_anchor_message
    FOREIGN KEY (anchor_message_id)
    REFERENCES messages(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
