# Deeppin — CLAUDE.md

## 项目概述

Deeppin 是 AI 辅助的结构化深度思考工具。用户对 AI 回复中感兴趣的文字「插针」开启子线程追问，所有子线程并行存在、可无限嵌套，最后一键合并成结构化输出。

**产品形态（优先级）：** Web Chat MVP → Chrome 插件 → 阅读器 → React Native。

---

## 核心概念

- **插针（Pin）**：用户选中 AI 回复中的文字，生成锚点并开启一个独立的子线程。
- **子线程（Thread）**：继承锚点原文 + 主线摘要 + 自身历史；**不**看其他针（完全隔离）。支持无限嵌套。
- **Compact**：context 向下传递时按深度自动压缩，`_BUDGETS_BY_DEPTH = [800, 500, 300, 150]`，再深封底 50 token。目的：任意嵌套深度下 prompt 总量可控。
- **合并输出（Merge）**：把主线和选中的子线程合成 Markdown（自由总结 / 要点列表 / 结构化分析）。

---

## 技术栈

```
前端  Next.js 14 App Router + Tailwind + Framer Motion + Zustand
      Vercel → https://deeppin.vercel.app

后端  FastAPI + Python 3.11 async
      Oracle Cloud Free Tier（4 核 24G ARM）+ Docker Compose
      Nginx 反代 → https://deeppin.duckdns.org
      日志：/app/logs/app.log（30 天轮转）

数据  Supabase Postgres + Auth（Google OAuth，四表 RLS，后端 JWT 依赖）
      pgvector（bge-m3 1024 维）存附件块 + 对话记忆

AI    SmartRouter（自研，llm_client.py）统一调度 5 家免费 provider：
      Groq / Cerebras / SambaNova / Gemini / OpenRouter
      分组：chat / merge / summarizer / vision / whisper
      usage-based 路由 + 429 自动 fallback

搜索  自托管 SearXNG（docker-compose 服务）
嵌入  BAAI/bge-m3（本地，sentence-transformers，共享 hf-cache volume）
监控  Prometheus + Grafana（docker-compose，nginx /grafana/ 反代）
```

---

## 前后端职责

- 前端：UI 渲染、SSE 接收、Zustand 状态、路由。
- 后端：LLM 调用、context 构建、SSE 推送、持久化、认证。
- **铁律**：前端不直调 AI API；API key 只在后端 env。

---

## 数据模型

六张表（schema 见 `backend/db/schema.sql`，全部 RLS）：`sessions` / `threads`（自引用 → 无限嵌套）/ `messages`（含 `model` 列记录哪个 provider 生成的）/ `thread_summaries` / `attachment_chunks` / `conversation_memories`。前端 TS 类型见 `frontend/stores/useThreadStore.ts`。

---

## Context 构建

见 `backend/services/context_builder.py` 的 `build_context()`：主线走滑动窗口 + 摘要前缀，子线程走祖先摘要链 + 锚点 + 自身历史；每一步都过 compact 预算。

---

## LiteLLM / SmartRouter

provider × key × model 展开成扁平 slot 列表，usage-based 选剩余额度最多的 slot，失败自动换。**真实配置见 `llm_client.py` 的 `ModelSpec` 列表，改 CLAUDE.md 之前先看那里。**

| group | 用途 | fallback |
|-------|------|---------|
| chat | 主对话、深度推理、子线程追问 | summarizer |
| merge | 合并输出（长上下文） | chat → summarizer |
| summarizer | compact 摘要、分类、建议问题 | chat |
| vision | 图片理解 | 无 |
| whisper | 语音转文字（Groq 原生 API） | 无 |

**健康检查端点**：

| 端点 | 作用 | quota 成本 |
|------|------|------|
| `GET /health` | backend / searxng / supabase / embedding 聚合检查 | 0 |
| `GET /health/providers/keys` | 每个 (provider, key) 的 `/v1/models` 校验 + model_id 漂移检查 | 0 |
| `GET /health/providers/full` | 每个 slot 真跑一次推理（daily CI 用） | 消耗 quota |

---

## API 端点

```
POST /api/sessions                   创建 session
GET  /api/sessions/:id               session + 线程树
POST /api/threads                    创建线程（主线 / 针）
POST /api/threads/:id/chat           发消息（SSE 流式）⭐
POST /api/threads/:id/suggest        子线程建议追问
POST /api/search                     联网搜索（SSE）
POST /api/sessions/:id/attachments   上传文件
POST /api/merge                      合并输出
```

---

## 部署架构

```
浏览器 ──HTTPS──→ Vercel（Next.js）
       └─HTTPS──→ Oracle Free Tier（Docker Compose）
                  ├── nginx（TLS + 反代 backend / grafana，屏 /metrics）
                  ├── backend（FastAPI + SmartRouter + bge-m3）
                  ├── searxng
                  ├── prometheus（127.0.0.1:9090 仅回环，90d/10GB）
                  └── grafana（/grafana/ 子路径，GF_SERVER_SERVE_FROM_SUB_PATH=true）
```

**共享 volume** `deeppin-hf-cache`（external）：prod + staging 共用一份 bge-m3（~4.3G）。需手动 `docker volume create deeppin-hf-cache`。

**nginx 关键配置**：`/` → `backend:8000`（SSE buffering off / 5min timeout）；`/grafana/` → `grafana:3000`（proxy_pass **不带** trailing slash）；`location = /metrics { return 404 }`。staging 走 `staging-deeppin.duckdns.org` → `host.docker.internal:8001`。

---

## CI/CD

### 分支策略

- `main` = 线上真源，push 即部 prod（`deploy-backend.yml`）
- 工作分支（`feat/*` / `chat-<id>`）不自动部署
- **staging** = 手动触发 `deploy-staging.yml`，部到 `staging-deeppin.duckdns.org`

**必须走 staging**（不能直推 main）：改 `backend/**` / Docker / compose / nginx / CI workflow / scripts / Supabase schema。**可以直推 main**：注释、docstring、CLAUDE.md / README / 纯文档。

**理由**：单测跑在 GitHub runner 上不测 nginx、不测 compose、不测 CI 自身。一旦这些挂在 prod，现场就是 502 全站挂 + 要 ssh 救。staging 是唯一能验证 infra 的环境。

### 三个 workflow

| workflow | 触发 | 动作 |
|---|---|---|
| `test-backend.yml` | PR / 分支 push（`backend/**`） | 单测 |
| `deploy-backend.yml` | push main（`backend/**` / compose / nginx / scripts / workflow 自身） | 单测 → prod 部署 → smoke → 集成 |
| `deploy-staging.yml` | `workflow_dispatch` | 单测 → 部指定分支到 staging → 集成 |

### staging 实务

- 同一时间只能验一个分支（Oracle 24G 塞不下多个 bge-m3 backend）；前端每分支独立 Vercel preview URL（serverless 零成本）
- `docker compose restart <svc>` **不重读** `env_file`；改 .env 要 `up -d --force-recreate <svc>`
- 手动部 staging：`docker compose -p deeppin-staging --env-file compose.staging.env -f docker-compose.yml -f docker-compose.staging.yml up -d --build backend searxng`

### 日常流程

```
1. 开 feat/xxx 分支 → push（自动跑 test-backend.yml）
2. 想在手机/staging 验 → bot /deploy feat/xxx（或 gh workflow run deploy-staging.yml -f branch=feat/xxx）
3. 访问 https://staging-deeppin.duckdns.org/health 看结果
4. 开 PR 合 main → 合并后自动部 prod
```

---

## 本地开发

```bash
# 后端
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# 前端
cd frontend && npm install && npm run dev
```

**关键 env**（`backend/.env`）：
```
GROQ_API_KEYS / CEREBRAS_API_KEYS / SAMBANOVA_API_KEYS / GEMINI_API_KEYS / OPENROUTER_API_KEYS  # JSON 数组
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
ALLOWED_ORIGINS=["http://localhost:3000"]
```

`frontend/.env.local`：`NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
`compose.env`（Oracle）：port 映射 + `SEARXNG_INTERNAL=http://searxng:8080` + `GRAFANA_ADMIN_PASSWORD`。

---

## MVP 状态

核心 MVP 全部完成（对话、插针、三栏、合并、搜索、附件、图片、Markdown、持久化、OAuth、CI/CD、监控）。待完成：Chrome 插件、移动端适配。详见 `README.md`。

---

## 公司信息

Deeppin LLC（Washington State）/ 创始人 Zizhao Fang。

---

## 代码规范

- 注释：**中英双语**（中文在前）。docstring / 日志消息同样。
- Markdown 文档中文为主；`README.md` 双语（对外）。
- Commit message：**全英文**，`<type>: <简述>` 前缀（feat / fix / refactor / test / docs）。
- 前端 TypeScript 严格模式；后端 Python 全 async + 类型注解。
- 组件函数式；Zustand 管状态；API 调用统一封装 + retry。

---

## 测试规范

**新增功能必须同步写单元测试。** 写完立刻跑。

```bash
cd backend && pytest tests/ -q --ignore=tests/integration    # 默认必跑
cd backend && pytest tests/test_foo.py -q                    # 单文件
# 集成测试打真实部署（需 Supabase 凭证），平时不跑
```

**原则**：mock 外部依赖（Supabase / LLM API）；patch 路径必须是**被测模块内的名称**，不是定义所在模块；`asyncio.gather` 并发复用一个 Supabase 客户端会炸 httpx，别这么写。

**已知噪音**：`test_embedding_service` 全量跑时偶发 RuntimeError（单测必过，sentence-transformers test-ordering），`asyncio.get_event_loop_policy` DeprecationWarning 是 pytest-asyncio 的噪音。

---

## 协作约定 / Claude 工作方式

> 跟当前开发者（Zizhao）反复确认过的工作方式。遇到不确定先按这里走。

### 🟢 自动执行（不问）

只读 / 诊断类**直接跑**：`git status` / `git log` / `git diff` / `gh run list/view/pr view` / `ls` / `cat` / `curl GET` / `pytest` / `ssh oracle "docker logs..."`。

### 🟡 先确认

改共享状态或不可逆：`git push` / `git commit` / `git reset --hard` / 删分支 / 部署 / 重启生产 / 改 Supabase schema / 删文件 / 改 env / 写 PR/Issue 评论。

### 🔴 绝对不做

`--no-verify` 跳 hook；force-push 到 main；没授权改 Supabase 生产数据。

### 改完代码的收尾清单

1. 跑测试：`cd backend && pytest tests/ -q --ignore=tests/integration`
2. **更新文档**：如果改动影响架构 / API / 部署 / provider 清单 / MVP 范围 / 开发约定 → 同步 update CLAUDE.md，必要时 README.md。过期文档比没有更糟。
3. Commit 信息：`<type>: <英文简述>`，必要时带正文解释为什么。
4. **push 前 confirm**：用户没明说「push」就不要自己 push。

### 本地并发 Claude：用 git worktree

- 单会话 interactive 开发：主 clone 够用
- 想同时起 2+ 个 Claude 在本地工作 → **开 worktree，不要共享一个 checkout**
  ```bash
  git worktree add ../deeppin-<name> <branch>   # branch 不存在会从 HEAD 建
  cd ../deeppin-<name>                          # 起新 Claude 会话
  # 每个 worktree 独立 HEAD / index / node_modules，互不踩
  ```
- 共享 checkout 会踩 HEAD / index / 文件写入竞争，并发跑必炸
- Telegram bot 自动给每个 chat 起 worktree（`$WORKSPACES_ROOT/<workspace>/chat-<id>/`）；Mac 端按需手动开
- 合 PR 后清：`git worktree remove ../deeppin-<name>`（分支保留）
- 每次 session 启动前 `git fetch origin main && git rebase origin/main`，避免陈旧 base
- 详细设计见文章 `worktree-concurrent-claude`

---

## 运维 / 生产访问

```bash
ssh oracle                                                      # alias 直连
ssh oracle "docker ps"
ssh oracle "docker logs deeppin-backend-1 --tail 200 -f"        # 流式后端日志
ssh oracle "tail -f /home/ubuntu/deeppin/backend/logs/app.log"  # 持久化日志
```

**生产端点**：

| 用途 | URL |
|------|-----|
| 前端 | https://deeppin.vercel.app |
| 后端 | https://deeppin.duckdns.org |
| /health | https://deeppin.duckdns.org/health |
| Key/catalog 校验 | https://deeppin.duckdns.org/health/providers/keys |
| Grafana | https://deeppin.duckdns.org/grafana/（admin 密码 seed 在 `compose.env` 的 `GRAFANA_ADMIN_PASSWORD`，UI 改完持久化到 `grafana_data` volume） |
| Prometheus | `127.0.0.1:9090` 仅回环；`ssh -L 9090:127.0.0.1:9090 oracle` 打隧道 |
| `/metrics` | 公网 404（nginx 屏蔽），只有 compose 内 prometheus 能拉 |

**CI/CD 触发**：`backend/**` push main → 自动部 prod；前端改动 → Vercel 自动；每日 10:00 UTC → `daily-provider-check` 跑全 provider 真实推理巡检。

---

## 已知问题 / Known flakiness

- **OpenRouter `:free`**：上游对免费额度有**全局**节流（不是 key RPD 耗尽），daily check 偶发 `429 temporarily rate-limited` 正常；key 真失效会是 401/403。
- **Gemini RPD 1K**：白天高峰跑 CI 可能撞上限；CI 用 `/health/providers/keys` 零 quota 校验规避。
- **Supabase + asyncio.gather 竞态**：共享 Supabase 客户端并发触发 httpx 连接池竞争；要么串行，要么每任务单独拿 client。
