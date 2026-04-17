-- 删除自研 dashboard 的指标表（已迁移到 Prometheus + Grafana）
-- Drop metrics tables from the self-rolled dashboard (replaced by Prometheus + Grafana).
--
-- 如果生产环境跑过 006_metrics_tables.sql，需要手动在 Supabase SQL editor 跑这个迁移。
-- If 006_metrics_tables.sql has been applied to production, run this manually in the Supabase SQL editor.
drop index if exists idx_metrics_snapshots_component;
drop index if exists idx_metrics_snapshots_ts;
drop table if exists metrics_snapshots;
drop table if exists metrics_counters;
