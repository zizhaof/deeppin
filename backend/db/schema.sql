-- backend/db/schema.sql
create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  parent_thread_id uuid references threads(id) on delete cascade,  -- null = main thread
  anchor_text text,
  anchor_message_id uuid,  -- FK added after messages table; see below
  depth int not null default 0,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  token_count int,
  created_at timestamptz default now()
);

create table if not exists thread_summaries (
  thread_id uuid primary key references threads(id) on delete cascade,
  summary text not null,
  token_budget int not null,
  updated_at timestamptz default now()
);

-- Add FK from threads.anchor_message_id → messages.id (separate because of ordering)
DO $$ BEGIN
  ALTER TABLE threads
    ADD CONSTRAINT fk_anchor_message
    FOREIGN KEY (anchor_message_id)
    REFERENCES messages(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
