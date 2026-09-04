# Frontend Module Documentation

## Overview

The frontend module provides a terminal-style web interface for YouSim. Built with React, TypeScript, and Vite. Works with or without Supabase — in local mode, no authentication is required.

## Key Features

### Local Mode Support
When `VITE_SUPABASE_URL` is not set:
- Supabase client is `null` (not initialized)
- `getAuthToken()` returns `null`
- All API calls omit the `Authorization` header
- App skips anonymous sign-in and auth state listeners
- Sessions load directly from the API

When `VITE_SUPABASE_URL` is set:
- Supabase client initializes normally
- Anonymous sign-in on first load
- JWT token attached to all API calls

### Terminal-Style UI
- Solarized Light color theme
- Command prompt with username@hostname format
- Color-coded output (searcher, simulator, commands)
- ASCII art banner
- Keyboard shortcuts (Esc to clear, arrows for history, Tab for completion)

### Session Management
- Auto-loads latest "simulator" session or creates new
- Reset, clear, help, banner meta-commands
- History navigation with up/down arrows

### Streaming Responses
- `/manual` endpoint streams Simulator responses in real-time
- `/auto` endpoint streams GaslitClaude auto-generation
- Message updates via React state reducer pattern

## Setup

```bash
# Development
cd src/frontend
bun run dev
# → http://localhost:5173

# Build for production (outputs to src/api/public)
bun run build
```

### Environment Variables (all optional)

```bash
VITE_SUPABASE_URL=    # Omit for local mode
VITE_SUPABASE_KEY=    # Omit for local mode
VITE_API_URL=         # Omit if frontend/API on same origin
```

## Architecture

| File | Purpose |
|---|---|
| `src/main.tsx` | React entry point + QueryClient |
| `src/App.tsx` | Main component: auth, sessions, terminal UI |
| `src/api.ts` | API client with conditional Supabase auth |
| `src/config.ts` | Terminal theme, command lists, key hints |
| `src/index.css` | Terminal-style CSS |

## Dependencies

### Production
- `react`, `react-dom` — UI framework
- `@tanstack/react-query` — Data fetching
- `@supabase/supabase-js` — Auth (optional, conditional)

### Development
- `vite`, `@vitejs/plugin-react` — Build tooling
- `typescript` — Type checking
