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
        部署：Vercel（免费）

后端：  FastAPI + Python 3.11 + asyncio
        部署：Oracle Cloud Free Tier（4核24G ARM，永久免费）
        反向代理：Nginx

数据库：Supabase（PostgreSQL + Auth）
        免费 tier，500MB

AI：    Groq（全部免费）+ LiteLLM Router 动态路由
        chat 梯队：6 个模型 × N 个 key，usage-based 路由，429 自动 fallback
        summarizer 梯队：3 个轻量模型，负责摘要/分类/格式化

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

### Provider 策略：Groq 单 Provider，多 Key × 多模型叠加

全部使用 Groq，通过多账号 × 多模型叠加额度，LiteLLM Router 统一调度，零成本。

#### 模型分组

| model_name | 职责 | fallback |
|-----------|------|----------|
| chat | 主对话、深度推理、多轮对话 | 全部耗尽后降级到 summarizer |
| summarizer | compact 摘要、分类、格式化 | 极端兜底接主对话 |
| vision | 图片理解（llama-4-scout）| 无 fallback |
| whisper | 语音转文字，走 Groq 原生 API | 无 fallback |
| guard | 内容安全审核（可选接入）| 无 fallback |

#### chat 梯队（RPD 1K/模型，usage-based 路由）

| 模型 | TPM | RPM |
|------|-----|-----|
| openai/gpt-oss-120b | 8K | 30 |
| moonshotai/kimi-k2-instruct | 10K | 60 |
| moonshotai/kimi-k2-instruct-0905 | 10K | 60 |
| llama-3.3-70b-versatile | 12K | 30 |
| qwen/qwen3-32b | 6K | 60 |
| meta-llama/llama-4-scout-17b-16e-instruct | 30K | 30 |

#### summarizer 梯队（轻量任务）

| 模型 | RPD | TPM |
|------|-----|-----|
| llama-3.1-8b-instant | 14.4K | 6K |
| openai/gpt-oss-20b | 1K | 8K |
| allam-2-7b | 7K | 6K |

```python
# backend/services/llm_client.py 核心逻辑

router = Router(
    model_list=build_model_list(),          # 所有 key × 所有模型展开
    routing_strategy="usage-based-routing", # 优先选剩余额度最多的
    fallbacks=[{"chat": ["summarizer"]}],   # chat 全部耗尽才触发
    allowed_fails=len(GROQ_API_KEYS) * len(CHAT_MODELS),
)
```

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

```
本地开发 → git push → GitHub
                │
                ├── 前端：Vercel 自动检测，零配置部署
                │
                └── 后端：GitHub Actions
                          → SSH 到 Oracle
                          → git pull
                          → docker-compose up -d --build
```

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy Backend
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Oracle
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ubuntu
          key: ${{ secrets.ORACLE_SSH_KEY }}
          script: |
            cd /home/ubuntu/deeppin
            git pull origin main
            docker-compose up -d --build backend
```

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
SUPABASE_SERVICE_KEY=xxx
ALLOWED_ORIGINS=["http://localhost:3000"]

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

---

## MVP 功能范围

**必须做（1 周内）：**
- 主线 AI 对话（SSE 流式）
- 选中文字 → 插针
- 子线程展开（桌面三栏布局）
- 无限嵌套 + compact context
- 面包屑导航
- 合并输出
- Supabase 持久化
- 部署到 Vercel + Oracle

**不做（MVP 阶段）：**
- 用户账号系统（匿名 session 即可）
- Chrome 插件
- 移动端适配
- LiteLLM 切换（直接用 Claude API）

---

## 开发节奏（1 周，AI 辅助）

```
Day 1：搭架子
  后端：FastAPI 骨架 + Supabase schema + /stream 端点跑通
  前端：Next.js 项目 + 三栏布局骨架 + SSE 接入
  目标：主线对话能跑起来

Day 2：插针
  后端：创建 thread API + context_builder 基础版
  前端：MessageBubble 选中逻辑 + PinMenu + 锚点高亮
  目标：能插针，子线程能问答

Day 3：Compact + 嵌套
  后端：compact 摘要逻辑 + 无限嵌套 context 构建
  前端：BreadcrumbNav + 子线程里继续插针
  目标：多层嵌套能正确继承 context

Day 4：合并输出 + 持久化
  后端：/merge 端点 + Supabase 存读
  前端：MergeOutput 面板 + 格式选择 + Markdown 导出
  目标：完整功能闭环

Day 5：部署 + 联调
  Oracle 配 Nginx + Docker Compose
  GitHub Actions CI/CD
  前后端联调，修 bug
  目标：公网可访问
```

---

## 公司信息

- 公司名：Deeppin LLC
- 注册州：Washington State
- 创始人：Zizhao Fang

---

## 代码规范
- 注释用中文或英文，不用韩文或其他语言
- TypeScript 严格模式（前端）
- Python 全部 async/await，类型注解必须写（后端）
- 组件用函数式，不用 class
- 状态管理：Zustand（多线程并发场景）
- API 调用统一封装，带错误处理和 retry
- 注释用中文
- 提交信息：`feat:` / `fix:` / `refactor:` 前缀
