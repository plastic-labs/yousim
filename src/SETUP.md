# YouSim Monorepo Setup Guide

## Initial Setup

1. Install dependencies from the root directory:
```bash
bun install
```

This will install all dependencies for all packages thanks to the workspace configuration.

2. Create symlinks to the root `.env` file in each package directory:
```bash
cd packages/cli && ln -sf ../../.env .env
cd packages/api && ln -sf ../../.env .env
cd packages/core && ln -sf ../../.env .env
```

This allows Bun to automatically load environment variables from the root `.env` file.

## Running the CLI

Due to limitations with Bun's workspace filter commands and interactive stdin, you need to run the CLI directly from the CLI package directory:

```bash
cd packages/cli
bun run start
```

Note: The CLI will prompt you for a name and then continue the conversation loop. Type "exit" to quit.

## Running the API

To run the API:
```bash
bun run start:api
```

Or directly from the API package:
```bash
cd packages/api
bun run start
```

## Environment Variables

Create a `.env` file in the root directory by copying the template:
```bash
cp .env.template .env
```

Then fill in your API keys in the `.env` file.

Bun automatically loads environment variables from `.env` files in the current working directory. With the symlinks in place, each package will automatically load the environment variables from the root `.env` file.

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

## Development

To run all packages in development mode:
```bash
bun run dev
```

This will run the dev script in all packages simultaneously.