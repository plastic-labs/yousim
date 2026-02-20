# YouSim Monorepo (Bun)

This monorepo contains the Bun-based implementations of YouSim with shared core functionality.

## Structure

- `src/core` — Shared simulation logic, agents, storage abstraction, LLM providers
- `src/cli` — Terminal interface (Simulator, Constructor, Chat modes)
- `src/api` — Backend API using Bun/Elysia (pluggable storage, multi-mode auth)
- `src/frontend` — React/Vite frontend (works with or without Supabase)
- `src/launcher` — Single binary launcher (`yousim`, `yousim server`, `yousim config`)

## Setup

```bash
bun install
cp .env.template .env
# Set PROVIDER + API key (e.g., ANTHROPIC_API_KEY)
```

## CLI

```bash
cd src/cli
bun run start
# Select mode: 1) Simulator  2) Constructor  3) Chat
```

## Server (API + Frontend)

```bash
bun run start:api
# Runs at http://localhost:3000
# No Supabase needed — uses SQLite by default
```

## Global Binary

```bash
bunx yousim          # CLI with mode selection
bunx yousim server   # API server + frontend
bunx yousim config   # Show config and settings
```

## Environment Variables

Only `PROVIDER` + matching API key are required:

```bash
PROVIDER=anthropic          # or openai, groq, openrouter
ANTHROPIC_API_KEY=sk-...    # for anthropic
```

Optional:
```bash
YOUSIM_API_KEY=...          # Enable API key auth for server
SUPABASE_URL=...            # Enable Supabase storage + JWT auth
SUPABASE_KEY=...
VITE_SUPABASE_URL=...       # Enable Supabase auth in frontend
VITE_SUPABASE_KEY=...
```

See `.env.template` for the full list.
