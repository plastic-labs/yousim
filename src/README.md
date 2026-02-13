# YouSim Monorepo (Bun)

This monorepo contains the Bun-based implementations of YouSim with shared core functionality.

## Structure

- `src/core` - Shared simulation logic and LLM integration
- `src/cli` - Command-line interface
- `src/api` - Backend API using Bun and Elysia.js
- `src/frontend` - React/Vite frontend
- `src/launcher` - Single binary launcher (`yousim`, `yousim server`)

## Setup

Install dependencies from the root:

```bash
bun install
```

## CLI Usage

Run the CLI directly from its package directory (stdin issues with Bun filters):

```bash
cd src/cli
bun run start
```

## Global Binary

Install the launcher to get the `yousim` command:

```bash
npm i -g @yousim/launcher
```

```bash
yousim
yousim server
```

Requires Bun on the host machine.

Configuration can be stored in `~/.yousim/.env` or `~/.yousim/config.json`:

```bash
# ~/.yousim/.env
PROVIDER=anthropic
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

## API Usage

```bash
# From root
bun run start:api

# Or directly
cd src/api
bun run start
```

## Frontend Usage

```bash
cd src/frontend
bun run dev
```

## Environment Variables

Create a `.env` file in the root directory with your API keys:

```bash
# LLM Provider options include anthropic or openrouter
PROVIDER=anthropic
MODEL=claude-sonnet-4-5-20250929
# Anthropic API Key
ANTHROPIC_API_KEY=your_api_key_here
```

For the API package, you'll also need Supabase credentials:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

For the frontend build, you'll need:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_KEY=your_supabase_anon_key
```
