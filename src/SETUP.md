# YouSim Monorepo Setup Guide

## Initial Setup

1. Install dependencies from the root directory:

```bash
bun install
```

2. Create symlinks to the root `.env` file in each package directory (optional, but convenient):

```bash
cd src/cli && ln -sf ../../.env .env
cd src/api && ln -sf ../../.env .env
cd src/core && ln -sf ../../.env .env
cd src/frontend && ln -sf ../../.env .env
```

## Running the CLI

Due to limitations with Bun's workspace filter commands and interactive stdin, run the CLI directly:

```bash
cd src/cli
bun run start
```

## Global Binary

Install the launcher to get `yousim` commands:

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

## Running the API

```bash
# From root
bun run start:api

# Or directly
cd src/api
bun run start
```

## Running the Frontend

```bash
cd src/frontend
bun run dev
```

## Building for Deployment

The frontend build is configured to output into `src/api/public` so the API can serve it.

```bash
bun run build
```

## Environment Variables

Create a `.env` file in the root directory by copying the template:

```bash
cp .env.template .env
```

Then fill in your API keys in the `.env` file.

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

## Development

To run API and frontend together in development mode:

```bash
bun run dev
```
