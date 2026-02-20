# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouSim is a general-purpose identity simulator that lets you explore, construct, and chat with identities in the latent space of LLMs. It's a zero-config distributable package — only an LLM API key is required. The codebase is organized as a Bun workspaces monorepo.

## Repository Structure

- **`src/core`** (`@yousim/core`): Shared simulation logic, agents, storage abstraction, and multi-provider LLM integration.
- **`src/cli`** (`@yousim/cli`): Terminal interface with three modes: Simulator, Constructor, Chat.
- **`src/api`** (`@yousim/api`): Elysia API with pluggable storage (SQLite/Supabase), multi-mode auth, and `/v1/construct` programmatic API.
- **`src/frontend`** (`@yousim/frontend`): React/Vite frontend that works with or without Supabase.
- **`src/launcher`** (`yousim`): Single binary launcher (`yousim`, `yousim server`, `yousim config`).
- **`openclaw/`**: OpenClaw skill (SKILL.md + craft-identity.sh) for programmatic identity crafting.
- **`legacy-python/`**: Original Python implementation (archived, not maintained).
- **`PM/`**: Project management documentation with detailed architecture notes.
- **`supabase/`**: Supabase configuration (optional).

## Core Architecture

### Storage Abstraction

The `Storage` interface (`src/core/src/storage.ts`) defines operations for sessions, messages, summaries, and users. Three implementations:

- **`MemoryStorage`** (`src/core/src/storage/memory.ts`): In-memory, zero deps. Used by CLI.
- **`SqliteStorage`** (`src/core/src/storage/sqlite.ts`): bun:sqlite at `~/.yousim/yousim.db`. Default for server.
- **`SupabaseStorage`** (`src/api/src/storage/supabase.ts`): Wraps @supabase/supabase-js. Used when SUPABASE_URL set.

Factory: `createStorage()` auto-detects based on environment.

### Auth System

Multi-mode auth in `src/api/src/auth.ts`:
- **Local**: No SUPABASE_URL, no YOUSIM_API_KEY → all requests use user "local"
- **API Key**: YOUSIM_API_KEY set → Bearer token validation → user "api-user"
- **Supabase**: SUPABASE_URL set → JWKS JWT verification → user from payload.sub

### Provider System

Four LLM providers (`src/core/src/agents.ts`, `src/core/src/index.ts`):
- **Anthropic** (default): `claude-sonnet-4-5-20250929`
- **OpenAI**: `gpt-4o`
- **Groq**: `llama-3.3-70b-versatile` (via OpenAI-compatible API)
- **OpenRouter**: `anthropic/claude-3.5-sonnet`

Selection via `PROVIDER` env var. Model override via `MODEL` env var.

### Agent Classes (`src/core/src/agents.ts`)

- **GaslitClaude**: "Searcher" Claude exploring identities
- **Simulator**: Responds to commands as the simulated identity
- **Constructor**: Guides identity construction conversation
- **Summary**: Summarizes constructor conversations into identity seeds
- **SummaryFollowUp**: Affirms identity based on summary
- **Identity**: Multi-stage initialization and chat

## Common Development Commands

```bash
bun install                    # Install dependencies
cp .env.template .env          # Configure (only PROVIDER + API key needed)
cd src/cli && bun run start    # CLI (mode selection)
bun run start:api              # API server (SQLite, no auth)
cd src/frontend && bun run dev # Frontend dev server
bun run dev                    # API + frontend dev mode
bun run build                  # Build frontend
bun run test                   # Run tests
```

## Environment Configuration

**Required** (only one):
- `PROVIDER`: `anthropic`, `openai`, `groq`, or `openrouter`
- Matching API key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, or `OPENROUTER_API_KEY`

**Optional:**
- `MODEL`: Override default model
- `YOUSIM_API_KEY`: Enable API key auth for server
- `SUPABASE_URL` + `SUPABASE_KEY`: Use Supabase storage + JWT auth
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY`: Enable Supabase auth in frontend
- `PORT`: API server port (default: 3000)

## Key Implementation Details

### Message Handling

The API stores messages via the Storage interface. Each message tracks `session_id`, `user_id`, `content`, `is_user`, `created_at`.

### v1/construct API

Three endpoints for programmatic identity crafting:
- `POST /v1/construct` — Start/continue constructor conversation
- `POST /v1/construct/summary` — Generate identity_md + soul_md
- `GET /v1/construct/:id` — Get session state

### Frontend Local Mode

When `VITE_SUPABASE_URL` is not set, the frontend works without any authentication. The Supabase client is null, and all API calls omit the Authorization header.

## Docker Deployment

```bash
docker compose up --build
```

## Workspace Dependencies

- Both CLI and API depend on `@yousim/core` via `workspace:*`
- Changes to core are immediately available to dependent packages

## Testing Notes

- CLI maintains conversation history in memory only
- API persists via Storage interface (SQLite or Supabase)
- Exit CLI with "exit" command or Ctrl+C
- The simulation prompt suggests commands, but the LLM responds to any input

IMPORTANT
ALWAYS use mcp_filesystem-with-morph_edit_file tool to make any code edits. Do not use the default edit tool.
