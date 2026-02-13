# YouSim Monorepo Architecture

## Overview

This document provides a high-level overview of the YouSim monorepo architecture, which organizes the project into three distinct packages using Bun workspaces:

1. `@yousim/core` - Shared simulation logic
2. `@yousim/cli` - Command-line interface
3. `@yousim/api` - Backend API service

## Package Structure

### @yousim/core

**Location:** `src/core/`

This is the foundational package that contains all shared logic for the YouSim simulation experience:

- LLM provider integration (Anthropic, OpenRouter)
- Core simulation functions
- Message handling and formatting
- Shared types and interfaces

The core package is designed to be provider-agnostic and can be consumed by any interface that wants to offer the YouSim experience.

**Key Features:**

- Unified interface for multiple LLM providers
- Stream-based text generation for real-time responses
- Environment variable configuration handling
- TypeScript type definitions for consistent usage

### @yousim/cli

**Location:** `src/cli/`

The command-line interface package provides a terminal-based way to interact with the YouSim simulation:

- Interactive conversation loop
- Color-coded output for different roles
- Readline-based input handling
- Direct execution via `bun run start`

**Important Note:** Due to limitations with Bun's workspace filter commands and interactive stdin, this package must be run directly from its directory:

```bash
cd src/cli
bun run start
```

**Key Features:**

- Terminal-based user interface
- Persistent conversation history
- Role-based color coding (user vs simulator)
- Exit handling with graceful cleanup

### @yousim/api

**Location:** `src/api/`

The API package provides a web service interface for YouSim using Elysia.js:

- RESTful API endpoints
- Session management
- Supabase integration for persistence
- JWT authentication

This package can be run either through Bun's workspace filter or directly:

```bash
# Via workspace filter
bun run start:api

# Or directly
cd src/api
bun run start
```

**Key Features:**

- HTTP API with JSON responses
- Session-based conversation management
- User authentication and authorization
- Supabase integration for data persistence

## Environment Variables

Bun automatically loads environment variables from `.env` files. In this monorepo, we use symlinks to share environment variables across src:

- Root `.env` file contains all necessary configuration
- Each package has a symlink to the root `.env` file
- This allows consistent configuration across all src

## Dependencies

The monorepo uses Bun workspaces to manage dependencies efficiently:

- Shared dependencies are deduplicated
- Internal src are linked as workspace dependencies
- Each package maintains its own specific dependencies

**Workspace Dependencies:**

- `@yousim/cli` depends on `@yousim/core`
- `@yousim/api` depends on `@yousim/core`

## Development Workflow

### Initial Setup

1. Install all dependencies from root: `bun install`
2. Create symlinks to `.env` file in each package directory

### Running Packages

- **API:** `bun run start:api` (from root)
- **CLI:** `cd src/cli && bun run start` (must be run directly)

### Development Commands

- Run all src in dev mode: `bun run dev`
- Run tests across all src: `bun run test`
- Build all src: `bun run build`

