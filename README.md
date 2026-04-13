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

**MVP complete (Days 1–4):**

| Feature | Status |
|---------|--------|
| SSE streaming chat | ✅ |
| Pin (text selection → sub-thread) | ✅ |
| Infinite nesting + compact context | ✅ |
| Breadcrumb navigation | ✅ |
| Three-column desktop layout | ✅ |
| Anchor highlight + guide lines | ✅ |
| Sub-thread suggestion questions | ✅ |
| Merge output (3 formats) | ✅ |
| Web search (SearXNG + AI) | ✅ |
| File attachments + RAG | ✅ |
| Markdown rendering | ✅ |
| Supabase persistence | ✅ |

**Not yet done:**
- User auth (currently anonymous sessions)
- Chrome extension
- Mobile layout
- Production deployment (Vercel + Oracle)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + Zustand |
| Backend | FastAPI + Python 3.11 + asyncio |
| Database | Supabase (PostgreSQL) |
| AI | LiteLLM Router + Groq (usage-based routing, multi-key) |
| Search | SearXNG (self-hosted) |
| Deployment | Vercel (frontend) + Oracle Cloud Free Tier (backend) |

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

# Run backend tests
cd backend
pytest tests/ -q
```

### Environment Variables

**`backend/.env`**
```
GROQ_API_KEYS=["gsk_key1","gsk_key2"]   # JSON array, multi-account
SUPABASE_URL=xxx
SUPABASE_SERVICE_KEY=xxx
ALLOWED_ORIGINS=["http://localhost:3000"]
SEARXNG_URL=http://localhost:8888        # optional, enables web search
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
- [ ] User authentication
- [ ] Production deployment (Vercel + Oracle)
- [ ] Chrome Extension
- [ ] Mobile App (React Native)

## Company

Deeppin LLC — Washington State

---

*Built for thinkers who refuse to choose between depth and flow.*
