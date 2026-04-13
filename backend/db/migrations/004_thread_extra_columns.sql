-- backend/db/migrations/004_thread_extra_columns.sql
-- 为 threads 表补充插针所需的列

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS anchor_start_offset int,
  ADD COLUMN IF NOT EXISTS anchor_end_offset   int,
  ADD COLUMN IF NOT EXISTS side                text CHECK (side IN ('left', 'right')),
  ADD COLUMN IF NOT EXISTS title               text;
