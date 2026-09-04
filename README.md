# YouSim

YouSim is a general-purpose identity simulator that lets you explore, construct, and chat with identities in the latent space of LLMs. Zero-config: only an LLM API key is required.

## Quick Start

```bash
# Install dependencies
bun install

# Configure (only PROVIDER + API key needed)
cp .env.template .env
# Edit .env: set ANTHROPIC_API_KEY (or OPENAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY)

# Run CLI (mode selection: Simulator, Constructor, Chat)
cd src/cli
bun run start

# Or run server (API + frontend, uses SQLite locally)
bun run start:api
```


## Repository Layout

- `src/core` (`@yousim/core`): Shared simulation logic, agents, and storage abstraction
- `src/cli` (`@yousim/cli`): Terminal interface — Simulator, Constructor, and Chat modes
- `src/launcher` (`yousim`): Single binary launcher
- `openclaw/`: OpenClaw skill for programmatic identity crafting
- `PM/`: Project management/architecture notes
- `legacy-python/`: Archived Python + webshell implementation

## Features

### Multi-Mode CLI
```bash
yousim
# Select: 1) Simulator  2) Constructor  3) Chat
```

- **Simulator**: Explore identities in the latent space (Searcher Claude + Simulator Claude)
- **Constructor**: Build a new identity through guided conversation, then optionally chat with it
- **Chat**: Chat with a previously constructed identity

### BYOK Multi-Provider
Supports 4 LLM providers out of the box:

| Provider | Env Var | Default Model |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `OPENROUTER_API_KEY` | `anthropic/claude-3.5-sonnet` |

Set `PROVIDER=openai` (or `groq`, `openrouter`) and the matching API key.

### Zero-Config Storage
- **No env vars**: SQLite at `~/.yousim/yousim.db` (auto-created)

### Programmatic API (`/v1/construct`)
Any agent framework can craft identities programmatically:

```bash
# Start a constructor conversation
curl -s localhost:3000/v1/construct \
  -H "Content-Type: application/json" \
  -d '{"message": "Nova"}'
# Returns: { session_id, response, turn, done }

# Continue the conversation
curl -s localhost:3000/v1/construct \
  -H "Content-Type: application/json" \
  -d '{"message": "3", "session_id": "..."}'

# Generate identity files
curl -s localhost:3000/v1/construct/summary \
  -H "Content-Type: application/json" \
  -d '{"session_id": "...", "name": "Nova"}'
# Returns: { summary, identity_md, soul_md }
```

### OpenClaw Skill
```bash
# Interactive
bash openclaw/craft-identity.sh

# Automated
bash openclaw/craft-identity.sh --auto '{"name":"Nova","creature":"autonomous agent","vibe":"sharp"}'
```

## Global Binary

```bash
# Install
npm i -g yousim  # or: bunx yousim

# CLI (mode selection)
yousim

# Server (API + frontend)
yousim server --port 3000

# Show config
yousim config
```

Requires Bun on the host machine. Config stored in `~/.yousim/.env` or `~/.yousim/config.json`.

## Server Mode

```bash
yousim server
# or: bun run start:api
```

Runs the Elysia API + serves the built frontend. Auth mode auto-detected:

| Config Present | Auth Mode | Storage |
|---|---|---|
| Nothing | Local (no auth) | SQLite |
| `YOUSIM_API_KEY` | API key bearer | SQLite |

`GET /api/mode` returns the active auth mode.

## Production / Deployment

```bash
# Build frontend into API public directory
bun run build

# Start API (serves API + frontend)
bun run start:api

# Docker
docker compose up --build
```

## Environment Variables

See `.env.template` for the full list. Only `PROVIDER` + matching API key are required.

## Legacy Python/Webshell

The original Python API + webshell frontend are preserved under `legacy-python/` for reference.
