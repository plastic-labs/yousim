# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouSim is a general-purpose identity simulator that lets you explore, construct, and chat with identities in the latent space of LLMs. It's a zero-config distributable package — only an LLM API key is required. The codebase is organized as a Bun workspaces monorepo.

## Repository Structure

- **`src/core`** (`@yousim/core`): Shared simulation logic, agents, storage abstraction, and multi-provider LLM integration.
- **`src/cli`** (`@yousim/cli`): Terminal interface with three modes: Simulator, Constructor, Chat.
- **`src/api`** (`@yousim/api`): Elysia server for local use — SQLite, no auth — plus the `/v1/construct` programmatic API.
- **`src/frontend`** (`@yousim/frontend`): React/Vite frontend. No auth; talks to the local server.
- **`src/launcher`** (`yousim`): Single binary launcher (`yousim`, `yousim server`, `yousim config`).
- **`openclaw/`**: OpenClaw skill (SKILL.md + craft-identity.sh) for programmatic identity crafting.
- **`legacy-python/`**: Original Python implementation (archived, not maintained).
- **`PM/`**: Project management documentation with detailed architecture notes.

## Core Architecture

### Storage Abstraction

The `Storage` interface (`src/core/src/storage.ts`) defines operations for sessions, messages, summaries, and users. Two implementations ship here:

- **`MemoryStorage`** (`src/core/src/storage/memory.ts`): In-memory, zero deps.
- **`SqliteStorage`** (`src/core/src/storage/sqlite.ts`): bun:sqlite at `~/.yousim/yousim.db`. Default for the server.

Factory: `createStorage("memory" | "sqlite")`.

### No auth

This package is a local, single-user tool: it runs on your machine against your
own data and your own model credentials. There is no auth, no accounts, and no
server-side user concept — every request is the local owner.

Do not add an auth layer or a hosted storage backend here. If you find yourself
wanting one, it belongs in a downstream consumer, not in this package.

### The stable surface

`src/core/src/contract.ts` is the surface downstream consumers depend on. It must
stay importable from a browser and an edge runtime, so **it must never
transitively import a platform-only module** (`bun:sqlite`, `fs`, `os`, `path`).
A test in `src/core/src/__tests__/contract.test.ts` walks its import graph and
fails if one reappears. This is why `simulate()` lives in `simulate.ts` rather
than being reached through the `index.ts` barrel, which also exports the stores.

### Model credentials

`ModelConfig` (`src/core/src/model.ts`) carries `provider`/`model`/`apiKey`/
`baseURL`/`maxOutputTokens` **per call**. Env vars are consulted only for fields
the caller left unset. Never construct a provider client at module load from
`process.env` — that breaks browser use, where the credential arrives per call.

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
bun run src/launcher/src/index.ts sessions   # list saved sessions
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
- `MODEL`: Override default model. Note the simulator effect depends heavily on
  model choice — older, less instruction-tuned models produce far more
  interesting output than current frontier assistants.
- `OPENAI_BASE_URL`: Point at any OpenAI-compatible endpoint (local vLLM,
  Ollama, a gateway). Used when `PROVIDER=openai`.
- `PORT`: API server port (default: 3000)

## Key Implementation Details

### Message Handling

The API stores messages via the Storage interface. Each message tracks `session_id`, `user_id`, `content`, `is_user`, `created_at`.

### v1/construct API

Three endpoints for programmatic identity crafting:
- `POST /v1/construct` — Start/continue constructor conversation
- `POST /v1/construct/summary` — Generate identity_md + soul_md
- `GET /v1/construct/:id` — Get session state

### Frontend

The frontend sends no Authorization header and has no auth client. It talks to
the local server on the same origin unless `VITE_API_URL` says otherwise.

## Docker Deployment

```bash
docker compose up --build
```

## Workspace Dependencies

- Both CLI and API depend on `@yousim/core` via `workspace:*`
- Changes to core are immediately available to dependent packages

## Testing Notes

- CLI persists conversations to `~/.yousim/yousim.db` and they survive
  restarts. `yousim sessions` lists them, `yousim resume [id]` picks one back
  up. Path precedence: `YOUSIM_DB` > `XDG_DATA_HOME/yousim/` > `~/.yousim/`.
- API persists via the Storage interface (SQLite at `~/.yousim/yousim.db`)
- Exit CLI with "exit" command or Ctrl+C
- The simulation prompt suggests commands, but the LLM responds to any input

## Tests

`bun run test` runs the core suite. Keep the contract portability test passing —
it is the guard that keeps this package usable outside Bun.
