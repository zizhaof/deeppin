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
- 🔀 **Merge output** — combine all sub-thread insights into one structured summary
- 💾 **Persistent** — all sessions and threads saved to cloud

## How It Works

```
Main conversation
  └── 📍 Pin: "What is CAP theorem?"
        ├── Sub-thread: deep dive into CAP
        └── 📍 Pin: "What is QUORUM?"
              └── Sub-thread: deep dive into QUORUM
```

Context flows downward via compact summaries. The deeper you go, the more compressed the parent context — keeping token usage under control at any nesting depth.

## Product Roadmap

- [x] Product design & architecture
- [ ] Web Chat App (MVP)
- [ ] Chrome Extension
- [ ] Mobile App

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + Tailwind + Zustand |
| Backend | FastAPI + Python 3.11 |
| Database | Supabase (PostgreSQL) |
| AI | LiteLLM (Groq + Gemini + DeepSeek) |
| Deployment | Vercel + Oracle Cloud |

## Company

Deeppin LLC — Washington State

---

*Built for thinkers who refuse to choose between depth and flow.*
