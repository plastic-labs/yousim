# YouSim Monorepo

This monorepo contains the Bun-based implementations of YouSim with shared core functionality.

## Structure

- `packages/core` - Shared simulation logic and LLM integration
- `packages/cli` - Command-line interface
- `packages/api` - Backend API using Bun and Elysia.js

## Setup

1. Install dependencies from the root:
```bash
bun install
```

## CLI Usage

To run the CLI:
```bash
bun run --filter @yousim/cli dev
```

Or directly from the CLI package:
```bash
cd packages/cli
bun run dev
```

## API Usage

To run the API:
```bash
bun run --filter @yousim/api dev
```

Or directly from the API package:
```bash
cd packages/api
bun run dev
```

## Environment Variables

Create a `.env` file in the root directory with your API keys:

```bash
# LLM Provider options include anthropic or openrouter
PROVIDER=anthropic
# Anthropic API Key
ANTHROPIC_API_KEY=your_api_key_here
```

For the API package, you'll also need Supabase credentials:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
JWT_SECRET=your_jwt_secret
```