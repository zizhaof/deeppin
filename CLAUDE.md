# Deeppin — CLAUDE.md

## 项目概述

Deeppin 是一个 AI 辅助的结构化深度思考工具。核心功能是让用户在对话时，随时对感兴趣的文字「插针」开启子线程追问，所有子线程并行存在、可展开收起，最后一键合并成结构化文字输出。

**产品形态（优先级排序）：**
1. Web Chat 应用（MVP，优先）—— 验证核心交互
2. Chrome 浏览器插件 —— 扩展到任意网页
3. 阅读器
4. React Native 移动端（后期）

---

## 核心概念

### 插针（Pin）
用户选中 AI 回复中的任意文字后触发插针。被选中的文字称为「锚点」，插针后在原文高亮显示。每根针开启一个独立的子线程对话。

### 子线程（Thread）
子线程继承以下 context：
- 锚点原文（必须）
- 主线对话摘要 ≤300 tokens（必须）
- 子线程自身历史（必须）
- 其他针的内容（不包含，完全隔离）

### 嵌套与 Compact
子线程支持**无限嵌套**（子线程里可以继续插针）。

Context 向下传递时自动 compact，越深越压缩：

```
主线摘要        300 tokens
  └── 第 1 层：主线 compact 300 + 锚点
        └── 第 2 层：第 1 层 compact 200 + 锚点
              └── 第 3 层：第 2 层 compact 100 + 锚点
                    └── 第 N 层：上层 compact 50 + 锚点
```

目的：无论嵌套多深，传入 AI 的 context 总量可控，不爆 token 窗口。

### 合并输出（Merge）
将所有子线程的洞察合并成结构化文字，格式可选：
- 自由总结
- 要点列表
- 结构化分析（问题 / 方案 / 权衡 / 结论）

---

## 交互设计

### Web App — Desktop（MVP 重点）
- 三栏布局：左侧 threads | 中间主对话 | 右侧 threads
- 触发：鼠标选中 AI 回复文字 → 浮动工具栏 → 「📍 插针」
- 子线程以注释气泡形式显示在两侧，垂直位置对齐主线锚点
- 主线高亮文字左边蓝线 → 显示在左栏，右边蓝线 → 显示在右栏
- 右上角下拉可切换当前主视图（主线 / 任意子线程）
- 切换时显示面包屑：主线 › consistency level › QUORUM 原理
- 底部输入框跟随当前激活线程

### Web App — Mobile（后期）
- 触发：长按选中文字 → 「📍 插针」
- 子线程内联显示在锚点下方
- 底部 Tab 显示所有针

### Chrome 插件（Phase 2）
- 在任意网页注入，零遮挡默认
- 选中文字 → 浮动工具栏 → 插针
- 子线程右侧抽屉展开

---

## 技术栈

```
前端：  Next.js 14 (App Router) + Tailwind CSS + Framer Motion + Zustand
        部署：Vercel → https://deeppin.vercel.app

后端：  FastAPI + Python 3.11 + asyncio
        部署：Oracle Cloud Free Tier（4核24G ARM，永久免费）
        反向代理：Nginx → https://deeppin.duckdns.org
        日志：/app/logs/app.log（容器内，TimedRotatingFileHandler 30 天）

数据库：Supabase（PostgreSQL + Auth）
        Google OAuth + 四张表全部 RLS + 后端 JWT 依赖

AI：    LiteLLM Router 统一调度 6 个 provider（全部免费 tier 叠加）
        Groq / Cerebras / SambaNova / Gemini / NVIDIA NIM / OpenRouter
        分组：chat / merge / summarizer / vision / whisper
        usage-based routing + 429 自动 fallback，chat 耗尽降级 summarizer

搜索：  SearXNG（自托管在 Oracle，docker-compose 服务）
嵌入：  BAAI/bge-m3（1024 维，本地推理，sentence-transformers）

语言：  TypeScript（前端）+ Python（后端）
```

---

## 前后端职责划分

### 前端负责
- 所有 UI 渲染（三栏布局、气泡、高亮、动画）
- 用户交互（选中插针、输入、切换线程）
- SSE 流式接收 + 实时渲染
- Zustand 状态管理（线程树、流式状态、UI 状态）
- 路由（Next.js App Router）

### 后端负责
- Groq API 调用（API key 不暴露给前端）
- Context 构建（compact 逻辑、摘要生成）
- SSE 流式推送
- 数据持久化（session、thread、message 存 Supabase）
- 用户认证（JWT 验证）
- LiteLLM 调度（生产阶段）

### 原则
- 前端**不直接**调用任何 AI API，全部经过后端
- 前端**不做** context 构建，只负责展示
- API key 只存在后端环境变量

---

## 目录结构

```
deeppin/
├── frontend/                         Next.js
│   ├── app/
│   │   ├── page.tsx                  首页
│   │   └── chat/[sessionId]/
│   │       └── page.tsx              主对话页
│   ├── components/
│   │   ├── MainThread/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx     支持选中插针
│   │   │   └── InputBar.tsx
│   │   ├── SubThread/
│   │   │   ├── ThreadPanel.tsx       侧边子线程面板
│   │   │   ├── AnchorQuote.tsx       顶部锚点引用
│   │   │   └── BreadcrumbNav.tsx     面包屑
│   │   ├── PinMenu.tsx               选中后的浮动工具栏
│   │   └── MergeOutput.tsx           合并输出面板
│   ├── stores/
│   │   ├── useSessionStore.ts
│   │   ├── useThreadStore.ts         线程树 + 激活线程
│   │   └── useStreamStore.ts         各线程流式状态
│   └── lib/
│       ├── api.ts                    后端 API 调用封装
│       └── sse.ts                    SSE 客户端管理
│
├── backend/                          FastAPI
│   ├── main.py
│   ├── routers/
│   │   ├── sessions.py
│   │   ├── threads.py
│   │   └── stream.py                 SSE 流式端点
│   ├── services/
│   │   ├── context_builder.py        ⭐ compact 逻辑核心
│   │   ├── summarizer.py             摘要生成 + 缓存
│   │   ├── stream_manager.py         SSE 推送 + 存库
│   │   └── llm_client.py             Claude API 封装
│   ├── models/
│   │   ├── session.py
│   │   ├── thread.py
│   │   └── message.py
│   └── db/
│       ├── schema.sql
│       └── supabase.py
│
├── docker-compose.yml                Oracle 生产部署
└── CLAUDE.md
```

---

## 数据模型

```typescript
// 前端类型
interface Session {
  id: string
  createdAt: number
  mainThread: Message[]
  pins: Pin[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pins: PinAnchor[]
}

interface PinAnchor {
  pinId: string
  anchorText: string
  startOffset: number
  endOffset: number
  side: 'left' | 'right'
}

interface Pin {
  id: string
  anchorText: string
  anchorMessageId: string
  label: string
  depth: number           // 从 1 开始，无上限
  thread: Message[]
  childPins: Pin[]        // 无限嵌套
  isExpanded: boolean
  createdAt: number
}
```

```sql
-- 后端数据库 schema
sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  title text,
  created_at timestamptz DEFAULT now()
)

threads (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES sessions,
  parent_thread_id uuid REFERENCES threads,  -- null = 主线
  anchor_text text,
  anchor_message_id uuid REFERENCES messages,
  depth int DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

messages (
  id uuid PRIMARY KEY,
  thread_id uuid REFERENCES threads,
  role text CHECK (role IN ('user', 'assistant')),
  content text,
  token_count int,
  created_at timestamptz DEFAULT now()
)

thread_summaries (
  thread_id uuid PRIMARY KEY REFERENCES threads,
  summary text,
  token_budget int,       -- 这份摘要是按多少 token 预算压缩的
  updated_at timestamptz DEFAULT now()
)
```

---

## Context 构建（后端核心）

```python
# backend/services/context_builder.py

async def build_context(thread_id: str) -> list[dict]:
    thread = await get_thread(thread_id)
    context = []

    if thread.parent_id is None:
        # 主线：历史超出窗口时注入摘要前缀，取最近 N 条消息
        return await get_recent_messages_with_summary(thread_id)

    # 向上追溯祖先链
    ancestors = await get_ancestor_chain(thread_id)
    # 返回 [主线, 第1层, 第2层, ...] 不含当前层

    budgets = compute_compact_budgets(len(ancestors))
    # [300, 200, 100, 50, 50, ...] 越深越少，最低 50

    for i, ancestor in enumerate(ancestors):
        summary = await get_or_create_summary(ancestor.id, budget=budgets[i])
        label = "主线对话摘要" if i == 0 else f"第 {i} 层子线程摘要"
        context.append({"role": "system", "content": f"[{label}]\n{summary}"})

    # 锚点原文（完整保留）
    context.append({
        "role": "system",
        "content": f"用户在上述对话中选中了以下内容并提出追问，请围绕这段内容回答：\n\"{thread.anchor_text}\""
    })

    # 当前子线程历史
    messages = await get_recent_messages(thread_id)
    context.extend([{"role": m.role, "content": m.content} for m in messages])

    return context
```

---

## LiteLLM 配置

### Provider 策略：6 个免费 tier 叠加

LiteLLM Router 把 `provider × key × model` 展开成扁平 model_list，usage-based 路由挑剩余额度最多的 slot，失败自动换下一个。真实配置见 `backend/services/llm_client.py` 的 `ModelSpec` 列表。

#### 模型分组

| group | 用途 | fallback |
|-------|------|---------|
| chat | 主对话、深度推理、子线程追问 | 全部耗尽后降级 summarizer |
| merge | 合并输出（长上下文） | 无（走 chat 的 slot 子集）|
| summarizer | compact 摘要、分类、建议问题、路由判断 | 极端兜底接 chat |
| vision | 图片理解（截图 / 照片 / 图表）| 无 fallback |
| whisper | 语音转文字，走 Groq 原生 API | 无 fallback |

#### Provider 一览（概览，完整参数见代码）

| Provider | 代表模型 | 备注 |
|----------|---------|------|
| Groq | llama-3.3-70b-versatile / llama-4-scout / gpt-oss-120b / qwen3-32b / llama-3.1-8b-instant | llama-4-scout 进 vision |
| Cerebras | qwen-3-235b / llama3.1-8b | 大上下文 + 高 TPM |
| SambaNova | Llama-3.3-70B / Llama-4-Maverick-17B | RPD 1K |
| Gemini | gemini-2.5-flash / flash-lite | 原生多模态，flash 进 vision |
| NVIDIA NIM | llama-3.3-70b / llama-4-maverick / gemma-3-27b / nemotron-super-49b | gemma-3-27b 进 vision |
| OpenRouter | `:free` 系列（gpt-oss-120b / llama-3.3-70b / nemotron-super-120b / hermes-3-405b）| `:free` 有上游全局节流，见「已知问题」|

#### 健康检查端点

| 端点 | 作用 | 成本 |
|------|------|------|
| `GET /health` | 聚合检查：backend / searxng / supabase / embedding | 0 |
| `GET /health/providers/keys` | 每个 (provider, key) 的 `/v1/models` 校验 + 配置的 model_id 是否还在清单上 | 0 quota |
| `GET /health/providers/full` | 每个 slot 真跑一次推理（daily check 用） | 消耗 quota |

---

## API 端点

```
POST   /api/sessions                  创建 session
GET    /api/sessions/:id              获取 session + 线程树

POST   /api/threads                   创建线程（主线或针）
GET    /api/threads/:id/messages      获取消息历史

POST   /api/threads/:id/chat          发送消息（触发 AI，SSE 流式）⭐
POST   /api/threads/:id/suggest       获取子线程追问建议

POST   /api/search                    联网搜索（SearXNG + AI，SSE 流式）⭐

POST   /api/sessions/:id/attachments  上传文件附件（存 Supabase + 嵌入向量）

POST   /api/merge                     合并所有子线程输出
```

---

## 部署架构

```
用户浏览器
    │
    ├── HTTPS → Vercel（前端 Next.js）
    │           域名：deeppin.ai 或 deeppin.vercel.app
    │
    └── HTTPS → Oracle Free Tier（后端 FastAPI）
                域名：api.deeppin.ai
                Nginx 反向代理 → uvicorn :8000
                LiteLLM Router 内嵌在 backend 进程中

Oracle Free Tier 配置：
  - 4核 ARM，24GB 内存（永久免费）
  - Ubuntu 22.04
  - Docker Compose 管理服务
```

```yaml
# docker-compose.yml（Oracle 上）
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    restart: always
    # LiteLLM Router 内嵌在 backend 进程中，无需独立 litellm 服务
```

```nginx
# /etc/nginx/sites-available/deeppin
server {
    listen 443 ssl;
    server_name api.deeppin.ai;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header X-Real-IP $remote_addr;

        # SSE 必须的配置
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

---

## CI/CD Pipeline

### 分支策略
- `main` = 线上真源。push 即自动部 prod。
- 工作分支（`feat/*` / `chat-<id>`）= 不自动部署。
- **Staging** = 手动触发（GitHub UI / `gh` CLI / 手机 bot `/deploy`），部到 `staging-deeppin.duckdns.org` 验证，通过再合 main。

**何时必须走 branch + staging（不能直接推 main）**：
- 改后端逻辑 / 新 endpoint / 改 context_builder 等任何 `backend/**` 业务代码
- 改 Docker / docker-compose / Dockerfile / nginx / CI workflow / scripts/**
- 改 Supabase schema / migration

**可以直接推 main 的只有**：改注释、改 docstring、改 CLAUDE.md / README / 纯文档。

规则的理由：单测跑在 GitHub runner 上，**不测 nginx / 不测 docker-compose / 不测 CI 本身**，一旦这类东西挂在 prod，现场就是 502 全站挂 + 要 ssh 上 Oracle 手动救。Staging 是唯一能真正验证这些的环境。

### 三个 workflow

| workflow | 触发 | 动作 |
|---|---|---|
| `test-backend.yml` | PR 到 main / 非 main 分支 push（`backend/**`） | 跑 `pytest tests/ --ignore=tests/integration` |
| `deploy-backend.yml` | push 到 main（`backend/**` / compose / nginx / scripts） | 单测 → prod 部署 → smoke test → 集成测试 |
| `deploy-staging.yml` | `workflow_dispatch`（手动或 bot） | 单测 → 部指定分支到 staging（覆盖上一个） |

### Staging 架构

```
Oracle 同一台：
├── /home/ubuntu/deeppin              # prod
│   └── compose project: deeppin      → backend 容器 :8000
│       nginx 容器 :443              → deeppin.duckdns.org
└── /home/ubuntu/deeppin-staging      # staging（workflow 首次部署会 clone）
    └── compose project: deeppin-staging
        └── backend 宿主机 127.0.0.1:8001  ← prod 的 nginx 通过 host.docker.internal 转发
            searxng 宿主机 127.0.0.1:8081
```

**共享**：Supabase（同一项目 + 同一组 API keys）、Let's Encrypt 证书目录、主 nginx 容器  
**独立**：代码目录、compose project、宿主机端口

手动拉起 staging（workflow 内部用这条命令）：
```bash
docker compose -p deeppin-staging --env-file compose.staging.env \
  -f docker-compose.yml -f docker-compose.staging.yml up -d --build backend searxng
```

### 日常工作流

```
1. 开 feat/xxx 分支改代码
2. push → GitHub Actions 自动跑 test-backend.yml（单测门禁）
3. 想在手机上真跑一遍 → 发 bot /deploy feat/xxx → staging 更新
4. 访问 https://staging-deeppin.duckdns.org/health 验证
5. 开 PR 合 main → 合并后 deploy-backend.yml 自动部 prod
```

### Staging 首次搭建（一次性）

1. duckdns.org 登录，注册 `staging-deeppin` 指向 Oracle IP
2. Oracle 上申请证书：`sudo certbot certonly -d staging-deeppin.duckdns.org`
3. 把 GitHub PAT（有 `repo` + `workflow` 权限）写到 claude-telegram bot 的 `.env`：`GITHUB_TOKEN=ghp_...`
4. 首次 `gh workflow run deploy-staging.yml -r main` 拉起 staging 环境

### 旧 deploy-backend.yml 省略，详见文件内容（单测 → prod → smoke → 集成测试）

---

## 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev

# 环境变量
# backend/.env
GROQ_API_KEYS=["gsk_key1","gsk_key2"]   # 多账号叠加额度，JSON 数组，所有模型共用
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx           # service_role key，用于管理员操作和 JWT 验证
SUPABASE_ANON_KEY=xxx                   # anon key，用于用户身份的 RLS 查询
ALLOWED_ORIGINS=["http://localhost:3000"]

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

---

## MVP 功能范围

**已完成：**
- [x] 主线 AI 对话（SSE 流式）
- [x] 选中文字 → 插针 → 子线程
- [x] 三栏布局（桌面端）+ 锚点高亮 + 引导线
- [x] 无限嵌套 + compact context（depth-based token 预算）
- [x] 面包屑导航 + 前进/后退
- [x] 子线程建议追问（3 模板 + 3 LLM，归一化去重）
- [x] 合并输出（free / bullets / structured，Markdown 预览 + 下载）
- [x] 联网搜索（SearXNG + AI，自动检测实时查询）
- [x] 文件附件上传 + 向量嵌入 + RAG 检索（≤3K 字内联，>3K 字分块入库）
- [x] 图片识别（字节嗅探 PNG/JPEG/GIF/WEBP/BMP → vision 模型 → 文本 → 同附件分流）
- [x] Markdown 渲染（AI 消息）
- [x] Supabase 持久化（session / thread / message / summary）
- [x] 用户账号系统（Google OAuth + Supabase Auth + JWT，四张表全 RLS）
- [x] 生产部署（Vercel + Oracle Cloud + GitHub Actions CI/CD）
- [x] 每日 provider 巡检（daily-provider-check workflow）+ 零 quota key/catalog 校验（/health/providers/keys）

**待完成：**
- [ ] Chrome 插件（Phase 2）
- [ ] 移动端适配（Phase 2）

---

## 公司信息

- 公司名：Deeppin LLC
- 注册州：Washington State
- 创始人：Zizhao Fang

---

## 代码规范
- **代码注释：中英双语**（中文写在前，英文紧跟或下一行）。docstring、模块文档、日志消息都双语
- **Markdown 文档：中文为主**（CLAUDE.md、内部设计文档）。`README.md` 是对外的，保留中英双语
- **提交信息：全英文**（`feat:` / `fix:` / `refactor:` / `test:` / `docs:` 前缀 + 英文简述。正文和脚注也用英文）
- TypeScript 严格模式（前端）
- Python 全部 async/await，类型注解必须写（后端）
- 组件用函数式，不用 class
- 状态管理：Zustand（多线程并发场景）
- API 调用统一封装，带错误处理和 retry

---

## 测试规范

**每次新增功能必须同步写单元测试，写完立即运行。**

```bash
# 后端单元测试（改完 backend/** 必跑，不要跑 integration 目录会打真实网络）
cd backend && pytest tests/ -q --ignore=tests/integration

# 单文件跑
cd backend && pytest tests/test_attachment_processor.py -q

# 集成测试（打真实部署，需要 Supabase 凭证，平时不跑）
cd backend && TEST_BASE_URL=https://deeppin.duckdns.org \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  pytest tests/integration/ -v
```

**已知噪音，不用当真：**
- `test_embedding_service` 在全量跑时偶发 RuntimeError，单独跑必过 — 是 sentence-transformers 模型初始化的 test-ordering 问题，跟业务代码无关。
- `DeprecationWarning: asyncio.get_event_loop_policy` 是 pytest-asyncio 的已知噪音。

测试文件位置：`backend/tests/test_*.py`。写测试原则：
- mock 外部依赖（Supabase、LLM API），只测本模块逻辑。
- patch 路径必须是**被测模块内的名称**，不是定义所在模块。
- `asyncio.gather` 并发复用一个 Supabase 客户端会出 httpx 竞态，别这么写。

---

## 协作约定 / Claude 工作方式

> 以下是跟当前开发者（Zizhao）反复确认过的工作方式。遇到不确定，先按这里走。

### 🟢 自动执行（不问）
只读 / 诊断类命令**直接跑，不要问**：
- `git status` / `git log` / `git diff`
- `gh run list` / `gh run view` / `gh pr view`
- `ls` / `cat` / `curl GET` / `tail` 生产日志
- `pytest`（本地单元测试是只读的）
- `ssh oracle "docker logs ..."` / `ssh oracle "tail -f /app/logs/app.log"` 等日志观测

### 🟡 需要先确认
可能改共享状态或不可逆的操作：
- `git push` / `git commit` / `git reset --hard` / 删分支
- 部署、重启生产服务
- 改 Supabase schema、跑 migration
- 删文件、改 env 变量
- 写 GitHub PR/Issue 评论、发邮件

### 🔴 绝对不做
- `--no-verify` 跳过 hook
- `force-push` 到 main
- 在没授权的前提下改 Supabase 生产数据

### 改完代码后的收尾清单
每次完成一个任务（feat / fix / refactor），按顺序过：
1. **跑测试**：`cd backend && pytest tests/ -q --ignore=tests/integration`
2. **更新文档**：如果改动影响了架构、API、部署流程、模型/provider 清单、MVP 范围，或者引入了新的开发约定 —— **回头 update 这份 `CLAUDE.md` 和必要时 `README.md`**。过期的文档比没有还糟。
3. **commit 信息**：`<type>: <中文简述>`，必要时带多行 body 解释为什么。
4. **push 前 confirm**：除非用户明说「push」，不要自己 push。

---

## 运维 / 生产访问

### SSH 到 Oracle
```bash
ssh oracle                                          # alias 已配好，直接进
ssh oracle "docker ps"                              # 查容器状态
ssh oracle "docker logs deeppin-backend-1 --tail 200 -f"   # 流式看后端日志
ssh oracle "tail -f /home/ubuntu/deeppin/backend/logs/app.log"  # 持久化日志文件
```

### 生产端点
| 用途 | URL |
|------|-----|
| 前端 | https://deeppin.vercel.app |
| 后端 | https://deeppin.duckdns.org |
| 健康检查 | https://deeppin.duckdns.org/health |
| Key/catalog 校验 | https://deeppin.duckdns.org/health/providers/keys |

### CI/CD
- 改 `backend/**` push 到 main → GitHub Actions `deploy-backend.yml` 自动部署（`gh run watch` 看实时状态）
- 改前端 push 到 main → Vercel 自动检测并部署
- 每日 10:00 UTC → `daily-provider-check` 跑全 provider 真实推理巡检

---

## 已知问题 / Known flakiness

- **OpenRouter `:free` 模型**：上游对免费额度有**全局**节流（不是我们 key 的 RPD 耗尽），daily check 里偶发 `429 temporarily rate-limited` 是正常现象，不用恐慌。真缺 quota 会是 401/403。
- **Gemini RPD 1K**：每 key 每天 1000 次，白天高峰跑 CI 可能撞上限。CI 用 `/health/providers/keys` 零 quota 校验规避了这个问题。
- **Supabase + asyncio.gather 竞态**：共享 Supabase 客户端在并发请求下会触发 httpx 连接池竞争，要么串行，要么每个任务单独拿 client。
