# Deeppin

> 任何阅读场景的深度追问工具 —— 选中任意文字，插针开启子线程，主对话完全不受干扰。

*[English version / 英文版](README.md)*

## 这是什么？

读东西时想就某一段深挖，平时只有两个糟糕选项：

- **开新对话** → 丢 context，要从头解释一遍
- **在当前对话里追问** → 打断主线，思路被切碎

Deeppin 的解法是**插针（Pin）** —— 选中任意文字插一根针，打开独立子线程深挖。主对话完全不受干扰。

## 核心功能

- 📍 **任意插针** —— 选中 AI 回复里的任意文字开启子线程
- 🌿 **无限嵌套** —— 针里可以继续插针，想挖多深就挖多深
- 🧠 **智能上下文** —— 子线程通过 compact 摘要继承父线程上下文
- 🔀 **合并输出** —— 把选中的子线程洞察合并成结构化输出（自由总结 / 要点列表 / 结构化分析）
- 🌐 **联网搜索** —— 自动识别实时类问题（股价、天气、新闻）走 SearXNG
- 📎 **文件附件** —— 上传任意文件，短文本直接内联，长文本分块 + 向量化入库做 RAG
- 🖼️ **图片识别** —— 图片走 vision 模型生成描述，然后走和文本附件完全一样的流水线
- 💾 **持久化** —— 所有 session 和线程保存在 Supabase（PostgreSQL）
- 🔐 **账号系统** —— Google OAuth + 全表 RLS

## 工作原理

```
主线对话
  └── 📍 Pin：「什么是 CAP 定理？」
        ├── 子线程：深入 CAP
        └── 📍 Pin：「什么是 QUORUM？」
              └── 子线程：深入 QUORUM
```

Context 向下传递时自动 compact，越深越压缩，无论嵌套多深 token 总量都可控。

```
主线摘要           300 tokens
  └── 第 1 层：    主线 compact 300 + 锚点
        └── 第 2 层：第 1 层 compact 200 + 锚点
              └── 第 3 层：第 2 层 compact 100 + 锚点
```

## 当前状态

**MVP 完成并已上线生产：**

- 前端：https://deeppin.vercel.app
- 后端：https://deeppin.duckdns.org

| 功能 | 状态 |
|---|---|
| SSE 流式对话 | ✅ |
| 插针（选中文字 → 子线程） | ✅ |
| 无限嵌套 + compact 上下文 | ✅ |
| 面包屑导航 | ✅ |
| 三栏桌面布局 | ✅ |
| 锚点高亮 + 引导线 | ✅ |
| 子线程建议追问（3 模板 + 3 LLM） | ✅ |
| 合并输出（3 种格式） | ✅ |
| 联网搜索（SearXNG + AI） | ✅ |
| 文件附件 + RAG | ✅ |
| 图片识别（vision 模型 → 文本 → 同附件流水线） | ✅ |
| Markdown 渲染 | ✅ |
| Supabase 持久化 | ✅ |
| Google OAuth + Supabase Auth + JWT（全表 RLS） | ✅ |
| Vercel + Oracle Cloud 部署 + GitHub Actions CI/CD | ✅ |
| 每日 provider 巡检 + 零 quota key/catalog 校验 | ✅ |

**待完成：**

- Chrome 插件
- 移动端适配

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14（App Router）+ Tailwind CSS + Zustand |
| 后端 | FastAPI + Python 3.11 + asyncio |
| 数据库 | Supabase（PostgreSQL），全表 RLS |
| 认证 | Supabase Auth（Google OAuth）+ FastAPI JWT 中间件 |
| AI | LiteLLM Router 叠加 5 家免费 provider（Groq / Cerebras / SambaNova / Gemini / OpenRouter），usage-based 路由 + 429 自动 fallback |
| 嵌入 | BAAI/bge-m3（1024 维，sentence-transformers 本地推理） |
| 搜索 | SearXNG（Oracle 自托管） |
| 部署 | Vercel（前端）+ Oracle Cloud 免费层（后端：Nginx + Docker Compose） |
| CI/CD | GitHub Actions —— 推送到 `main` 且改动 `backend/**` 时 SSH 部署 |

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

# 后端单元测试（跳过 integration/，那个会打真实生产 API）
cd backend
pytest tests/ -q --ignore=tests/integration
```

### 环境变量

**`backend/.env`**

```
# LLM provider key（JSON 数组，多 key 叠加额度）
GROQ_API_KEYS=["gsk_...","gsk_..."]
CEREBRAS_API_KEYS=["csk_..."]
SAMBANOVA_API_KEYS=["..."]
GEMINI_API_KEYS=["..."]
OPENROUTER_API_KEYS=["sk-or-v1-..."]

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # 管理员权限，JWT 验证
SUPABASE_ANON_KEY=...            # 用户身份，RLS 查询

# CORS + 搜索
ALLOWED_ORIGINS=["http://localhost:3000"]
SEARXNG_URL=http://localhost:8888
```

**`frontend/.env.local`**

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

## 产品路线图

- [x] 产品设计 + 架构
- [x] Web 应用 MVP 核心功能
- [x] 用户认证（Google OAuth）
- [x] 生产部署（Vercel + Oracle）
- [ ] Chrome 插件
- [ ] 移动端（React Native）

## 公司信息

Deeppin LLC —— Washington State

## 许可证

[FSL-1.1-MIT](LICENSE.md) —— Functional Source License，2 年后转 MIT。

你可以自由使用、fork、修改、自部署 Deeppin 用于个人、公司内部、教学、研究。**不可以**用 Deeppin（或功能高度相似的衍生品）做与 Deeppin 直接竞争的商业服务。每个 release 在发布满 2 年后自动转为 MIT 协议。

如果想商业 host Deeppin，欢迎联系我们。

---

*为不愿在深度和心流之间二选一的思考者而建。*
