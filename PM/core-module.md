# @yousim/core Module Documentation

## Overview

The `@yousim/core` module contains the shared simulation logic that powers all YouSim interfaces (CLI, API, programmatic). It provides agents, LLM provider integration, and a pluggable storage abstraction.

## Key Components

### Agents

Six agent classes, all in `src/core/src/agents.ts`:

| Agent | Purpose |
|---|---|
| `GaslitClaude` | "Searcher" Claude that explores simulated identities |
| `Simulator` | The simulated identity responding to CLI commands |
| `Constructor` | Guides users through identity construction via conversation |
| `Summary` | Summarizes constructor conversations into identity seeds |
| `SummaryFollowUp` | Affirms identity based on summary |
| `Identity` | Multi-stage initialization and chat with a constructed identity |

### Simulation Engine

Core simulation function for direct LLM streaming:

```typescript
export async function simulate(messages: Message[], options: SimulationOptions = {})
```

### Storage Abstraction

Pluggable persistence layer (`src/core/src/storage.ts`):

```typescript
interface Storage {
  // Sessions: createSession, getSession, getSessions, updateSessionMetadata, deleteSession
  // Messages: getMessages, insertMessage
  // Summaries: getSummaries, getLatestSummary, insertSummary
  // Users: upsertUser
}
```

Three implementations:
- **`MemoryStorage`** — In-memory Maps, zero deps. Used by CLI.
- **`SqliteStorage`** — `bun:sqlite`, stores at `~/.yousim/yousim.db`. Used by local server.
- **`SupabaseStorage`** — Lives in `@yousim/api` (keeps core dependency-free).

Factory function:
```typescript
import { createStorage } from "@yousim/core/storage";
const storage = createStorage(); // Auto-detects: SUPABASE_URL → supabase, else → sqlite
```

### Message Interface

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string;
}
```

### Provider Support

Four LLM providers:

| Provider | Key Env Var | Default Model |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `OPENROUTER_API_KEY` | `anthropic/claude-3.5-sonnet` |

Selection via `PROVIDER` env var or `options.provider` parameter.

## Environment Configuration

- `PROVIDER` — LLM provider (`anthropic`, `openai`, `groq`, `openrouter`)
- `MODEL` — Override default model for any provider
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` — OpenRouter-specific model override

## Exports

```typescript
// Main entry: "@yousim/core"
export { simulate, Message, SimulationOptions, INITIAL_PROMPT, INITIAL_RESPONSE }
export { GaslitClaude, Simulator, Constructor, Summary, SummaryFollowUp, Identity }
export type { Storage, StoredSession, StoredMessage, StoredSummary }
export { MemoryStorage, SqliteStorage, createStorage }

// Storage entry: "@yousim/core/storage"
export { MemoryStorage, SqliteStorage, createStorage }
export type { Storage, StoredSession, StoredMessage, StoredSummary }
```

## Dependencies

- `@ai-sdk/anthropic` — Anthropic provider
- `@ai-sdk/openai` — OpenAI/OpenRouter/Groq provider (via custom baseURL)
- `ai` — Vercel AI SDK for streaming
- `@anthropic-ai/sdk`, `openai` — Provider SDKs
