# @yousim/api Module Documentation

## Overview

The `@yousim/api` module provides a web service interface for YouSim using Elysia.js and Bun. It supports three auth modes and three storage backends, enabling zero-config local use or production Supabase deployment.

## Key Features

### Multi-Mode Authentication (`src/api/src/auth.ts`)

Auto-detected from environment variables:

| Mode | Trigger | User ID |
|---|---|---|
| Local | No `SUPABASE_URL`, no `YOUSIM_API_KEY` | `"local"` |
| API Key | `YOUSIM_API_KEY` set | `"api-user"` |
| Supabase | `SUPABASE_URL` set | JWT `payload.sub` |

### Pluggable Storage

Uses the `Storage` interface from `@yousim/core`:
- **SQLite** (default for local/apikey modes) — `~/.yousim/yousim.db`
- **Supabase** (when `SUPABASE_URL` set) — via `SupabaseStorage` adapter in `src/api/src/storage/supabase.ts`

### RESTful API Endpoints

#### Existing Endpoints (preserved from pre-refactor)
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/mode` | Returns `{ auth: "supabase" \| "apikey" \| "local" }` |
| GET | `/user` | Create/get user |
| POST | `/manual` | Streaming simulator response to user command |
| POST | `/auto` | Streaming GaslitClaude auto-generation |
| POST | `/constructor` | Constructor conversation turn + summary generation |
| GET | `/summary` | Get summaries for a session |
| GET | `/identity` | Initialize and get identity prompt |
| POST | `/chat` | Chat with a constructed identity |
| POST | `/reset` | Create new session (optional mode) |
| GET | `/session` | Get session messages |
| GET | `/sessions` | List sessions (optional mode filter) |
| PUT | `/sessions/:id/metadata` | Update session metadata |
| GET | `/export/:id` | Export conversation as JSON |

#### v1/construct API (new)
General-purpose programmatic identity crafting:

| Method | Path | Description |
|---|---|---|
| POST | `/v1/construct` | Start or continue constructor conversation |
| POST | `/v1/construct/summary` | Generate identity_md + soul_md from conversation |
| GET | `/v1/construct/:id` | Get current session state |

**POST /v1/construct** request:
```json
{ "message": "Nova", "session_id": "optional-existing-id" }
```
Response:
```json
{ "session_id": "...", "response": "...", "turn": 1, "done": false }
```

**POST /v1/construct/summary** request:
```json
{ "session_id": "...", "name": "Nova" }
```
Response:
```json
{ "session_id": "...", "summary": "...", "identity_md": "...", "soul_md": "..." }
```

### Static Frontend Serving

Serves built frontend from `src/api/public` with SPA fallback.

## Usage

```bash
# From root
bun run start:api

# From package directory
cd src/api && bun run start

# Dev mode (watch)
cd src/api && bun run dev

# Via launcher
yousim server --port 3000
```

## Dependencies

- `@yousim/core` — Core simulation logic + storage interface
- `elysia` — Web framework for Bun
- `@elysiajs/cors` — CORS middleware
- `@elysiajs/static` — Static file serving
- `@supabase/supabase-js` — Supabase client (optional, for Supabase storage mode)
- `jose` — JWT verification (for Supabase auth mode)
