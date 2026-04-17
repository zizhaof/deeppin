# Deeppin

> Any reading scenario's deep inquiry tool — select any text, pin it, open a sub-thread, main conversation completely unaffected.

## What is Deeppin?

When you're reading something and want to dig deeper into a specific part, you have two bad options:
- **Start a new conversation** → lose context, have to re-explain everything
- **Ask in the current conversation** → interrupt the main thread, break the flow

Deeppin solves this with **pins** — select any text, pin it, and open a sub-thread to explore it deeply. The main conversation continues unaffected.

## Core Features

- 📍 **Pin anything** — select any text in an AI response to open a sub-thread
- 🌿 **Infinite nesting** — pin within pins, explore as deep as you want
- 🧠 **Smart context** — sub-threads inherit main thread context via compact summaries
- 🔀 **Merge output** — combine all sub-thread insights into one structured report (free-form / bullets / structured analysis)
- 🌐 **Web search** — auto-detects real-time queries (stock prices, weather, news) and routes to SearXNG
- 📎 **Attachments** — upload files; text extracted and embedded for RAG retrieval
- 💾 **Persistent** — all sessions and threads saved to Supabase (PostgreSQL)

## How It Works

```
Main conversation
  └── 📍 Pin: "What is CAP theorem?"
        ├── Sub-thread: deep dive into CAP
        └── 📍 Pin: "What is QUORUM?"
              └── Sub-thread: deep dive into QUORUM
```

Context flows downward via compact summaries. The deeper you go, the more compressed the parent context — keeping token usage under control at any nesting depth.

```
Main summary        300 tokens
  └── Layer 1:  main compact 300 + anchor
        └── Layer 2: layer 1 compact 200 + anchor
              └── Layer 3: layer 2 compact 100 + anchor
```

## Web App — Current Status

**MVP complete and deployed to production:**

- Frontend: https://deeppin.vercel.app
- Backend: https://deeppin.duckdns.org

| Feature | Status |
|---------|--------|
| SSE streaming chat | ✅ |
| Pin (text selection → sub-thread) | ✅ |
| Infinite nesting + compact context | ✅ |
| Breadcrumb navigation | ✅ |
| Three-column desktop layout | ✅ |
| Anchor highlight + guide lines | ✅ |
| Sub-thread suggestion questions (3 templates + 3 LLM) | ✅ |
| Merge output (3 formats) | ✅ |
| Web search (SearXNG + AI) | ✅ |
| File attachments + RAG | ✅ |
| Image recognition (vision model → text → same pipeline) | ✅ |
| Markdown rendering | ✅ |
| Supabase persistence | ✅ |
| Google OAuth + Supabase Auth + JWT (RLS on all tables) | ✅ |
| Vercel + Oracle Cloud deployment + GitHub Actions CI/CD | ✅ |
| Daily provider check + zero-quota key/catalog validation | ✅ |

**Not yet done:**
- Chrome extension
- Mobile layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + Zustand |
| Backend | FastAPI + Python 3.11 + asyncio |
| Database | Supabase (PostgreSQL) with RLS on all tables |
| Auth | Supabase Auth (Google OAuth) + FastAPI JWT middleware |
| AI | LiteLLM Router across 6 free-tier providers (Groq / Cerebras / SambaNova / Gemini / NVIDIA NIM / OpenRouter) with usage-based routing + 429 fallback |
| Embedding | BAAI/bge-m3 (1024-dim, local inference via sentence-transformers) |
| Search | SearXNG (self-hosted on Oracle) |
| Deployment | Vercel (frontend) + Oracle Cloud Free Tier (backend, Nginx + Docker Compose) |
| CI/CD | GitHub Actions — SSH deploy on push to `main` with `backend/**` changes |

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Backend unit tests (skip integration/ — those hit real deployed API)
cd backend
pytest tests/ -q --ignore=tests/integration
```

### Environment Variables

**`backend/.env`**
```
# LLM provider keys (JSON arrays — multiple keys per provider stack quota)
GROQ_API_KEYS=["gsk_...","gsk_..."]
CEREBRAS_API_KEYS=["csk_..."]
SAMBANOVA_API_KEYS=["..."]
GEMINI_API_KEYS=["..."]
NVIDIA_NIM_API_KEYS=["nvapi-..."]
OPENROUTER_API_KEYS=["sk-or-v1-..."]

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # admin-level, JWT verification
SUPABASE_ANON_KEY=...            # user-scoped, RLS queries

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

## Product Roadmap

- [x] Product design & architecture
- [x] Web Chat App — MVP core features
- [x] User authentication (Google OAuth)
- [x] Production deployment (Vercel + Oracle)
- [ ] Chrome Extension
- [ ] Mobile App (React Native)

## Company

Deeppin LLC — Washington State

---

*Built for thinkers who refuse to choose between depth and flow.*
