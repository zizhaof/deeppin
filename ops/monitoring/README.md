# Deeppin 监控系统 / Monitoring Stack

生产环境跑的是 Prometheus + Grafana，跟 backend / nginx / searxng 一起由同一个 docker-compose 管起来。本文说清楚：埋了什么指标、数据怎么跑、怎么访问、怎么排查。

## 总览 / Overview

```
┌──────────────┐    /metrics      ┌──────────────┐     datasource      ┌──────────┐
│ backend:8000 │ ───────────────▶ │ prometheus   │ ──────────────────▶ │ grafana  │
│ (FastAPI)    │   scrape 15s     │ :9090 loop   │   PromQL queries    │ :3000    │
└──────────────┘                  └──────────────┘                     └──────────┘
                                        │ 90d / 10GB retention              │
                                        ▼                                   ▼
                                  prometheus_data vol              /grafana/ via nginx
```

**埋点策略**：
1. HTTP API 层（`/api/**`）由 `prometheus-fastapi-instrumentator` 自动埋点
2. 组件调用（embedding / searxng / supabase）在调用现场手动加 `Counter + Histogram`
3. LLM Slot 窗口状态（rpm/tpm/rpd/tpd 用量 + score）用自定义 `Collector`，**scrape 时**才读 `SmartRouter.slots`，避免每次请求都更新 Gauge

## 访问 / Access

| 组件 | 访问方式 | 凭证 |
|---|---|---|
| Grafana | https://deeppin.duckdns.org/grafana/ | `admin` / `GRAFANA_ADMIN_PASSWORD`（首次登录后在 UI 改，改完持久化到 `grafana_data` volume） |
| Prometheus UI | `127.0.0.1:9090` 仅回环。本机打隧道：`ssh -L 9090:127.0.0.1:9090 oracle`，然后浏览器访问 http://localhost:9090 | 无 |
| Backend `/metrics` | 公网 **404**（nginx 挡），只有 compose 内 `prometheus` 容器能 scrape `backend:8000/metrics` | 无 |

## 埋点清单 / Metric Catalog

### HTTP API 层（自动埋点）
- `http_requests_total{handler, method, status}` — 请求数
- `http_request_duration_seconds{handler, method}` — 响应延迟直方图
- `http_request_size_bytes` / `http_response_size_bytes` — 请求/响应体积

### 组件调用
| Metric | 类型 | 维度 | 含义 |
|---|---|---|---|
| `deeppin_embedding_calls_total` | Counter | `result` (ok/error) | bge-m3 embedding 批次 |
| `deeppin_embedding_duration_seconds` | Histogram | — | 单次批量 embedding 耗时 |
| `deeppin_embedding_chars_total` | Counter | — | 累计送入 embedding 的字符数 |
| `deeppin_searxng_calls_total` | Counter | `result` (ok/timeout/error) | SearXNG 查询次数 |
| `deeppin_searxng_duration_seconds` | Histogram | — | SearXNG 查询耗时 |
| `deeppin_supabase_calls_total` | Counter | `table, result` | Supabase 调用 |
| `deeppin_supabase_duration_seconds` | Histogram | `table` | Supabase 调用耗时 |

### LLM 层
| Metric | 类型 | 维度 | 含义 |
|---|---|---|---|
| `deeppin_llm_calls_total` | Counter | `provider, model, key_prefix, group` | 每个 slot 的成功调用数 |
| `deeppin_llm_tokens_total` | Counter | `provider, model, key_prefix` | 每个 slot 的累计 token 消耗（近似） |
| `deeppin_llm_failures_total` | Counter | `provider, model, key_prefix, reason` | 每个 slot 的失败数。`reason` ∈ {`rate_limit`, `server_error`, `auth`, `timeout`, `network`, `other`}，HTTP 状态码优先、异常类型兜底 |
| `deeppin_llm_{rpm,tpm,rpd,tpd}_used` | Gauge | `provider, model, key_prefix` | **当前窗口**用量（scrape 时现读） |
| `deeppin_llm_{rpm,tpm,rpd,tpd}_limit` | Gauge | `provider, model, key_prefix` | 配置的窗口上限 |
| `deeppin_llm_slot_score` | Gauge | `provider, model, key_prefix` | SmartRouter 打分（0=耗尽，1=全新） |
| `deeppin_llm_slot_recovery_seconds` | Gauge | `provider, model, key_prefix` | 离 backoff 结束还有多久（0=健康） |

**`key_prefix` 取 API key 前 8 位**，用来在同 provider 多 key 时区分账号。

## Dashboards

`ops/monitoring/grafana-provisioning/dashboards/deeppin.json` 提供了默认面板，启动时自动 provision 到 Grafana：

- **Overview**：backend up / 5min QPS / p95 latency / LLM 失败率
- **HTTP**：按 handler 的 QPS + 延迟分位数
- **LLM Slots**：每个 slot 的窗口使用率条形图 + score 热力图
- **Components**：embedding / searxng / supabase 调用数 + 延迟

**改面板的两条路**：
1. 在 UI 直接改 → 文件系统那份不变，重启 Grafana 会被 provisioning 的 JSON 覆盖
2. 改 `deeppin.json` → 重启 Grafana 生效

生产环境走 (2)：UI 上的编辑仅用于探索，定稿后把 JSON 导出覆盖到仓库再 push。

## 运维 / Operations

### Retention
- **Prometheus**：90 天 / 10GB（取先到的那个），命令行 flag 在 `docker-compose.yml` 里
- **Grafana**：无数据保留概念；admin 密码 + 面板编辑持久化到 `grafana_data` volume

### 数据恢复 / Disaster recovery
- `prometheus_data` volume 丢了：历史指标没了（90d 数据全丢），但新采集会立即恢复；dashboard 不受影响
- `grafana_data` volume 丢了：admin 密码回到 `GRAFANA_ADMIN_PASSWORD` 的 seed 值，provisioning 的 dashboard 自动重建；UI 上改过但没 export 的自定义面板会丢

目前**没做**自动备份。这俩 volume 都算「可重建状态」，不属于关键数据。

### Scrape 失败
生产 Prometheus 通过 compose 网络拉 `backend:8000/metrics`。如果 dashboard 突然 "No data"：

```bash
# 1. 确认 prometheus 看得见 target
ssh -L 9090:127.0.0.1:9090 oracle
open http://localhost:9090/targets      # UP/DOWN 状态

# 2. 确认 backend 真在导出指标
ssh oracle "docker exec deeppin-prometheus-1 wget -qO- http://backend:8000/metrics | head -20"
```

### 新加指标
1. 在 `backend/services/metrics.py` 加 `Counter/Histogram/Gauge`
2. 调用现场 `.inc()` / `.observe()` / `.labels(...).inc()`
3. 不用改 Prometheus 配置：Prometheus 拉的是整个 `/metrics`，新指标自动出现
4. Grafana dashboard 里加一个新 panel 用 `query-builder` 查这个 metric

**踩过的坑**：Grafana panel 配置里 datasource UID 如果写 `"uid": "prometheus"`，但 Grafana 启动时给 provisioned datasource 自动生成了 hash UID，就会 "No data"。修法：在 `datasources/prometheus.yml` 里显式固定 `uid: prometheus` + 配置 `deleteDatasources` 段强制重建。

## 当前不做 / Not Yet

- **Alertmanager**：没配告警规则，目前只采集不报警。想做的第一条是 `up{job="deeppin-backend"} == 0 for 2m` 发 Telegram bot
- **Logs**：backend 进程的 stdout 没走 Loki / ELK，仍然是 `tail -f /app/logs/app.log`
- **Tracing**：没接 OpenTelemetry / Jaeger，请求链路看不了

想看的节点 → 先在 Prometheus `/targets` 和现有 dashboard 里过一遍，再决定值不值得加新指标。
