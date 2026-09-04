# YouSim Monorepo Architecture

## Overview

YouSim is organized as a Bun workspaces monorepo with five packages plus an OpenClaw skill:

| Package | npm Name | Description |
|---|---|---|
| `src/core` | `@yousim/core` | Agents, LLM providers, storage abstraction |
| `src/cli` | `@yousim/cli` | Terminal interface (Simulator, Constructor, Chat) |
| `src/api` | `@yousim/api` | Elysia API + v1/construct endpoints |
| `src/frontend` | `@yousim/frontend` | React/Vite web UI (private, not published) |
| `src/launcher` | `yousim` | Single binary entry point for CLI and server |
| `openclaw/` | — | OpenClaw skill (SKILL.md + craft-identity.sh) |

## Dependency Graph

```
yousim (launcher)
├── @yousim/cli
│   └── @yousim/core
└── @yousim/api
    └── @yousim/core

@yousim/frontend (standalone, calls API via HTTP)
```

## Storage Architecture

```
@yousim/core defines:
  Storage interface ──→ MemoryStorage (in-memory, CLI)
                   ──→ SqliteStorage  (bun:sqlite, local server)

@yousim/api adds:
  SupabaseStorage (wraps @supabase/supabase-js)

Auto-detection:
  SUPABASE_URL set? → SupabaseStorage
  Otherwise         → SqliteStorage (~/.yousim/yousim.db)
```

## Auth Architecture

Three modes, auto-detected in `src/api/src/auth.ts`:

| Mode | Trigger | How It Works |
|---|---|---|
| Local | No SUPABASE_URL, no YOUSIM_API_KEY | All requests → user "local" |
| API Key | YOUSIM_API_KEY set | Bearer token must match → user "api-user" |
| Supabase | SUPABASE_URL set | JWT verified via JWKS → user from sub claim |

## Provider Architecture

Four LLM providers in `@yousim/core`, all using Vercel AI SDK:

| Provider | SDK | Default Model |
|---|---|---|
| Anthropic | `@ai-sdk/anthropic` | claude-sonnet-4-5-20250929 |
| OpenAI | `@ai-sdk/openai` | gpt-4o |
| Groq | `@ai-sdk/openai` (custom baseURL) | llama-3.3-70b-versatile |
| OpenRouter | `@ai-sdk/openai` (custom baseURL) | anthropic/claude-3.5-sonnet |

## Environment Variables

Bun auto-loads `.env` from the working directory. The launcher also reads `~/.yousim/.env` and `~/.yousim/config.json`.

Only `PROVIDER` + matching API key required. Everything else is optional.

## Publishing

| Package | Published As | Access |
|---|---|---|
| `src/launcher` | `yousim` | public |
| `src/core` | `@yousim/core` | public |
| `src/cli` | `@yousim/cli` | public |
| `src/api` | `@yousim/api` | public |
| `src/frontend` | — | private (not published) |

For publishing, replace `workspace:*` with actual version numbers.

## Development Commands

```bash
# Install all dependencies
bun install

# CLI (must run from package dir)
cd src/cli && bun run start

# API server
bun run start:api

# Frontend dev server
cd src/frontend && bun run dev

# API + frontend dev mode
bun run dev

# Build frontend into API public dir
bun run build

# Run tests
bun run test

# Via launcher
yousim            # CLI with mode selection
yousim server     # API server + frontend
yousim config     # Show config
```
