# Deeppin

> Any reading scenario's deep inquiry tool — select any text, pin it, open a sub-thread, main conversation completely unaffected.
>
> 任何阅读场景的深度追问工具 —— 选中任意文字，插针开启子线程，主对话完全不受干扰。

## What is Deeppin? / 这是什么？

When you're reading something and want to dig deeper into a specific part, you have two bad options:
- **Start a new conversation** → lose context, have to re-explain everything
- **Ask in the current conversation** → interrupt the main thread, break the flow

Deeppin solves this with **pins** — select any text, pin it, and open a sub-thread to explore it deeply. The main conversation continues unaffected.

读东西时想就某一段深挖，平时只有两个糟糕选项：
- **开新对话** → 丢 context，要从头解释一遍
- **在当前对话里追问** → 打断主线，思路被切碎

Deeppin 的解法是**插针（Pin）** —— 选中任意文字插一根针，打开独立子线程深挖。主对话完全不受干扰。

## Core Features / 核心功能

- 📍 **Pin anything / 任意插针** — select any text in an AI response to open a sub-thread / 选中 AI 回复里的任意文字开启子线程
- 🌿 **Infinite nesting / 无限嵌套** — pin within pins, explore as deep as you want / 针里可以继续插针，想挖多深就挖多深
- 🧠 **Smart context / 智能上下文** — sub-threads inherit main thread context via compact summaries / 子线程通过 compact 摘要继承父线程上下文
- 🔀 **Merge output / 合并输出** — combine all sub-thread insights into one structured report (free-form / bullets / structured analysis) / 把所有子线程的洞察合并成结构化输出（自由总结 / 要点列表 / 结构化分析）
- 🌐 **Web search / 联网搜索** — auto-detects real-time queries (stock prices, weather, news) and routes to SearXNG / 自动识别实时类问题（股价、天气、新闻）走 SearXNG
- 📎 **Attachments / 文件附件** — upload any file; short text goes inline, long text is chunked + embedded for RAG / 上传任意文件，短文本直接内联，长文本分块 + 向量化入库做 RAG
- 🖼️ **Image recognition / 图片识别** — images route to the vision model, the description goes through the same pipeline as text / 图片走 vision 模型生成描述，然后走和文本附件完全一样的流水线
- 💾 **Persistent / 持久化** — all sessions and threads saved to Supabase (PostgreSQL) / 所有 session 和线程保存在 Supabase（PostgreSQL）
- 🔐 **Auth / 账号系统** — Google OAuth + row-level security on every table / Google OAuth + 全表 RLS

## How It Works / 工作原理

```
Main conversation / 主线对话
  └── 📍 Pin: "What is CAP theorem?"
        ├── Sub-thread: deep dive into CAP
        └── 📍 Pin: "What is QUORUM?"
              └── Sub-thread: deep dive into QUORUM
```

Context flows downward via compact summaries. The deeper you go, the more compressed the parent context — keeping token usage under control at any nesting depth.

Context 向下传递时自动 compact，越深越压缩，无论嵌套多深 token 总量都可控。

```
Main summary / 主线摘要    300 tokens
  └── Layer 1 / 第 1 层:  main compact 300 + anchor
        └── Layer 2 / 第 2 层: layer 1 compact 200 + anchor
              └── Layer 3 / 第 3 层: layer 2 compact 100 + anchor
```

## Current Status / 当前状态

**MVP complete and deployed to production / MVP 完成并已上线生产：**

- Frontend / 前端: https://deeppin.vercel.app
- Backend / 后端: https://deeppin.duckdns.org

| Feature / 功能 | Status |
|---------|--------|
| SSE streaming chat / SSE 流式对话 | ✅ |
| Pin (text selection → sub-thread) / 插针（选中文字 → 子线程） | ✅ |
| Infinite nesting + compact context / 无限嵌套 + compact 上下文 | ✅ |
| Breadcrumb navigation / 面包屑导航 | ✅ |
| Three-column desktop layout / 三栏桌面布局 | ✅ |
| Anchor highlight + guide lines / 锚点高亮 + 引导线 | ✅ |
| Sub-thread suggestion questions (3 templates + 3 LLM) / 子线程建议追问（3 模板 + 3 LLM） | ✅ |
| Merge output (3 formats) / 合并输出（3 种格式） | ✅ |
| Web search (SearXNG + AI) / 联网搜索（SearXNG + AI） | ✅ |
| File attachments + RAG / 文件附件 + RAG | ✅ |
| Image recognition (vision model → text → same pipeline) / 图片识别（vision 模型 → 文本 → 同附件流水线） | ✅ |
| Markdown rendering / Markdown 渲染 | ✅ |
| Supabase persistence / Supabase 持久化 | ✅ |
| Google OAuth + Supabase Auth + JWT (RLS on all tables) / Google OAuth + 全表 RLS | ✅ |
| Vercel + Oracle Cloud deployment + GitHub Actions CI/CD / 生产部署 + CI/CD | ✅ |
| Daily provider check + zero-quota key/catalog validation / 每日 provider 巡检 + 零 quota 校验 | ✅ |

**Not yet done / 待完成：**
- Chrome extension / Chrome 插件
- Mobile layout / 移动端适配

## Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 |
|-------|-----------|
| Frontend / 前端 | Next.js 14 (App Router) + Tailwind CSS + Zustand |
| Backend / 后端 | FastAPI + Python 3.11 + asyncio |
| Database / 数据库 | Supabase (PostgreSQL) with RLS on all tables |
| Auth / 认证 | Supabase Auth (Google OAuth) + FastAPI JWT middleware |
| AI | LiteLLM Router across 6 free-tier providers (Groq / Cerebras / SambaNova / Gemini / NVIDIA NIM / OpenRouter) with usage-based routing + 429 fallback / 6 家免费 provider 叠加，usage-based 路由 + 429 自动 fallback |
| Embedding / 嵌入 | BAAI/bge-m3 (1024-dim, local inference via sentence-transformers) |
| Search / 搜索 | SearXNG (self-hosted on Oracle) / 自托管 |
| Deployment / 部署 | Vercel (frontend) + Oracle Cloud Free Tier (backend, Nginx + Docker Compose) |
| CI/CD | GitHub Actions — SSH deploy on push to `main` with `backend/**` changes / 推送到 main 且改动 `backend/**` 时 SSH 部署 |

## Local Development / 本地开发

```bash
# Backend / 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend / 前端
cd frontend
npm install
npm run dev

# Backend unit tests (skip integration/ — those hit the real deployed API)
# 后端单元测试（跳过 integration/，那个会打真实生产 API）
cd backend
pytest tests/ -q --ignore=tests/integration
```

### Environment Variables / 环境变量

**`backend/.env`**
```
# LLM provider keys (JSON arrays — multiple keys per provider stack quota)
# LLM provider key（JSON 数组，多 key 叠加额度）
GROQ_API_KEYS=["gsk_...","gsk_..."]
CEREBRAS_API_KEYS=["csk_..."]
SAMBANOVA_API_KEYS=["..."]
GEMINI_API_KEYS=["..."]
OPENROUTER_API_KEYS=["sk-or-v1-..."]

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # admin-level, JWT verification / 管理员权限，JWT 验证
SUPABASE_ANON_KEY=...            # user-scoped, RLS queries / 用户身份，RLS 查询

# CORS + search
ALLOWED_ORIGINS=["http://localhost:3000"]
SEARXNG_URL=http://localhost:8888
```

**`frontend/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

## Product Roadmap / 路线图

- [x] Product design & architecture / 产品设计 + 架构
- [x] Web Chat App — MVP core features / Web 应用 MVP 核心功能
- [x] User authentication (Google OAuth) / 用户认证
- [x] Production deployment (Vercel + Oracle) / 生产部署
- [ ] Chrome Extension / Chrome 插件
- [ ] Mobile App (React Native) / 移动端

## Company / 公司信息

Deeppin LLC — Washington State

---

*Built for thinkers who refuse to choose between depth and flow.*
*为不愿在深度和心流之间二选一的思考者而建。*
