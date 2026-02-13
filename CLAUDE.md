# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouSim is an identity simulator that lets you simulate identities within the latent space of Claude 3.5 Sonnet. The codebase is organized as a monorepo with Bun workspaces, containing both new Bun-based implementations and legacy Python/JavaScript code.

## Repository Structure

The repository follows a monorepo structure with workspaces defined in `src/*`:

- **`src/core`** (`@yousim/core`): Shared simulation logic and LLM integration. Provider-agnostic core that can be used by any interface.
- **`src/cli`** (`@yousim/cli`): Command-line interface for terminal-based simulations.
- **`src/api`** (`@yousim/api`): Backend API service using Bun and Elysia.js for web-based access.
- **`src/frontend`**: React/Vite frontend application.
- **`src/launcher`** (`@yousim/launcher`): Single binary launcher (`yousim`, `yousim server`).
- **`legacy-python/`**: Original Python implementation (not actively maintained).
- **`PM/`**: Project management documentation with detailed architecture notes.
- **`supabase/`**: Supabase configuration for database and authentication.

## Core Architecture

### Simulation Flow

The core simulation logic (src/core/src/index.ts:27-52) implements a provider-agnostic interface:

1. Messages are formatted as `{ role: "user" | "assistant", content: string }`
2. The `simulate()` function accepts messages and optional provider/model configuration
3. Supports both Anthropic and OpenRouter providers
4. Returns a text stream for real-time responses

The initial simulation experience includes a greeting prompt (src/core/src/index.ts:55-73) that establishes available commands like `/locate`, `/summon`, `/speak`, `/steer`, and `/request`.

### Provider System

The system supports multiple LLM providers configured via environment variables:

- **Anthropic**: Uses `claude-sonnet-4-5-20250929` model with prompt caching
- **OpenRouter**: Supports custom models via `OPENROUTER_MODEL` variable

Provider selection happens at runtime based on `PROVIDER` environment variable.

## Common Development Commands

### Initial Setup

```bash
# Install dependencies from root
bun install

# Copy environment template
cp .env.template .env
# Then fill in your API keys
```

### Running the Components

**CLI (must run from package directory due to stdin limitations):**

```bash
cd src/cli
bun run start
```

**API:**

```bash
# From root
bun run start:api

# Or from package directory
cd src/api
bun run start
```

**Frontend:**

```bash
cd src/frontend
bun run dev
```

### Development Commands

```bash
# Run all packages in dev mode
bun run dev

# Run tests across all packages
bun run test

# Build all packages
bun run build
```

## Environment Configuration

Environment variables are managed through a root `.env` file. Each package directory should have a symlink to the root `.env` for Bun to automatically load variables.

**Required variables:**

- `PROVIDER`: "anthropic" or "openrouter"
- `ANTHROPIC_API_KEY`: Required if using Anthropic provider
- `OPENAI_API_KEY` or `OPENROUTER_API_KEY`: Required if using OpenRouter
- `OPENROUTER_MODEL`: Required if using OpenRouter (e.g., "anthropic/claude-3.5-sonnet")

**API-specific variables:**

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase public key
- `SUPABASE_JWKS_URL`: Optional override for the JWKS endpoint
- `SUPABASE_JWT_ISSUER`: Optional override for the JWT issuer
- `PORT`: API server port (default: 3000)

**Legacy deployment variables (for Python/webshell):**

- `HONCHO_ENV`: Honcho server URL
- `HONCHO_APP_NAME`: Application name on Honcho
- `CLIENT_REGEX`: Frontend URL regex for CORS
- `SECRET_KEY`: Fernet key for encrypting share URLs

## Key Implementation Details

### Message Handling

The API (src/api/src/index.ts:95-174) stores messages in Supabase with both user and assistant messages linked to sessions. Each message tracks:

- `session_id`: Links messages to conversation sessions
- `user_id`: User who owns the message
- `content`: The message text
- `is_user`: Boolean to distinguish user from assistant messages

### CLI Color Coding

The CLI uses ANSI color codes:

- Blue (`\033[94m`): User input ("SEARCHER CLAUDE")
- Yellow (`\033[93m`): Simulator responses ("SIMULATOR CLAUDE")

### Authentication Flow

The API uses JWT tokens passed in the `Authorization: Bearer <token>` header. The token verification happens in the derived context (src/api/src/index.ts:43-69) and returns the user ID from the token payload.

## Supabase Integration

The project uses Supabase for:

- **Anonymous sign-ins**: Enabled for quick access
- **Magic link authentication**: Email template customized to show OTP code
- **Session management**: Stores conversation sessions and messages
- **User management**: Tracks users and their sessions

Configuration is in `supabase/config.toml`. For local development, you can run Supabase locally with `supabase start`.

## Docker Deployment

Docker Compose configuration is available in the root. The Bun/Elysia API builds the frontend and serves it from `src/api/public`:

```bash
docker compose up --build
```

## Workspace Dependencies

The monorepo uses workspace dependencies to link packages:

- Both CLI and API depend on `@yousim/core` via `workspace:*` protocol
- Changes to core are immediately available to dependent packages
- Bun efficiently handles workspace linking and deduplication

## Testing Notes

When testing the simulation, be aware:

- The CLI maintains conversation history in memory only
- The API persists all messages to Supabase
- Exit CLI with "exit" command or Ctrl+C
- The simulation prompt suggests various commands, but the LLM will respond to any natural language input
