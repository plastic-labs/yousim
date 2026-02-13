# @yousim/core Module Documentation

## Overview

The `@yousim/core` module contains the shared simulation logic that powers both the CLI and API interfaces. It provides a unified way to interact with different LLM providers while maintaining consistent behavior across all interfaces.

## Key Components

### Simulation Engine
The core simulation function that handles communication with LLM providers:

```typescript
export async function simulate(messages: Message[], options: SimulationOptions = {})
```

**Parameters:**
- `messages`: Array of message objects with role and content
- `options`: Configuration options for provider and model selection

**Returns:**
- Stream of text responses from the LLM

### Message Interface
Standardized message format for all interactions:

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string;
}
```

### Provider Support
Currently supports two LLM providers:
1. **Anthropic** - Uses Claude Sonnet 4 model with prompt caching
2. **OpenRouter** - Supports various models through the OpenRouter API

## Environment Configuration

The core module reads configuration from environment variables:
- `PROVIDER` - Specifies which LLM provider to use ("anthropic" or "openrouter")
- `MODEL` - Specifies which model to use (defaults to "claude-sonnet-4-5-20250929")
- Provider-specific API keys:
  - `ANTHROPIC_API_KEY` for Anthropic
  - `OPENAI_API_KEY` or `OPENROUTER_API_KEY` for OpenRouter

## Usage

The core module is designed to be consumed by other packages in the monorepo:

```typescript
import { simulate, Message } from "@yousim/core";

const messages: Message[] = [
  { role: "user", content: "Hello simulator!" }
];

const stream = await simulate(messages);
```

## Dependencies

- `@ai-sdk/anthropic` - For Anthropic provider integration
- `@ai-sdk/openai` - For OpenRouter provider integration
- `@anthropic-ai/sdk` - Official Anthropic SDK
- `ai` - Vercel AI SDK for streaming responses
- `openai` - OpenAI SDK for OpenRouter integration