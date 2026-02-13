# Issue 006: Anthropic Prompt Caching

**Status:** Open
**Priority:** Medium
**Dependencies:** 001 (Core Agents)
**Blocks:** None

## Description

Implement Anthropic's prompt caching feature to reduce costs and improve response times for repeated prompts. This was used in the legacy Python implementation for the GaslitClaude template.

## Background

Anthropic's prompt caching allows you to cache parts of your prompt that don't change between requests, reducing both costs and latency:

- **Cost Reduction:** 90% discount on cached tokens
- **Latency Reduction:** Faster responses since cached content doesn't need reprocessing
- **Use Cases:** System prompts, long context, examples

## Legacy Implementation

**File:** `legacy-python/api/calls.py:96-125`

```python
def claude(self):
    templated = self.template()
    template_cache_line = templated[-1].copy()
    template_cache_line["content"] = [
        {
            "type": "text",
            "text": template_cache_line["content"],
            "cache_control": {"type": "ephemeral"},
        }
    ]
    cache_line = self.history[-1].copy()
    cache_line["content"] = [
        {
            "type": "text",
            "text": cache_line["content"],
            "cache_control": {"type": "ephemeral"},
        }
    ]
    messages = [
        *templated[:-1],
        template_cache_line,
        *self.history[:-1],
        cache_line,
    ]
    res = anthropic.messages.stream(
        max_tokens=1024,
        messages=messages,
        model="claude-sonnet-4-5-20250929",
    )
```

**Caching Strategy:**
- Caches the last template message (system prompt setup)
- Caches the last history message (most recent context)
- Both use `ephemeral` cache type (5 minute TTL)

## Prompt Caching Documentation

**Anthropic API Format:**
```typescript
{
  role: "user",
  content: [
    {
      type: "text",
      text: "Your content here",
      cache_control: { type: "ephemeral" }
    }
  ]
}
```

**Cache Types:**
- `ephemeral`: 5 minute TTL, 90% cost reduction

**Caching Rules:**
- Only last message in each role block can be cached
- Minimum 1024 tokens to benefit from caching
- Cache is per-user (different users don't share cache)

## Implementation Strategy

### Update Core `simulate()` Function

**File:** `src/core/src/index.ts`

Add optional caching configuration:

```typescript
export interface SimulationOptions {
  provider?: string;
  model?: string;
  cachePoints?: number[]; // Indices of messages to cache
}

export async function simulate(
  messages: Message[],
  options: SimulationOptions = {}
) {
  const provider = options.provider || process.env.PROVIDER || "anthropic";
  const model = options.model || process.env.MODEL || "claude-sonnet-4-5-20250929";
  const cachePoints = options.cachePoints || [];

  let modelInstance;

  if (provider === "anthropic") {
    modelInstance = anthropic(model);

    // Apply caching if using Anthropic and cache points specified
    if (cachePoints.length > 0) {
      messages = applyCaching(messages, cachePoints);
    }
  } else if (provider === "openrouter") {
    modelInstance = openrouter(model);
    // OpenRouter doesn't support caching
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const stream = await streamText({
    model: modelInstance,
    messages: messages as any,
  });

  return stream;
}

function applyCaching(messages: Message[], cachePoints: number[]): any[] {
  return messages.map((msg, idx) => {
    if (cachePoints.includes(idx)) {
      return {
        role: msg.role,
        content: [
          {
            type: "text",
            text: msg.content,
            cache_control: { type: "ephemeral" }
          }
        ]
      };
    }
    return msg;
  });
}
```

### Update GaslitClaude Agent

**File:** `src/core/src/agents.ts`

```typescript
export class GaslitClaude {
  // ... existing properties ...

  async stream() {
    const template = this.getTemplate();
    const messages = [...template, ...this.history];

    // Cache the last template message and last history message
    const cachePoints = [
      template.length - 1,  // Last template message
      messages.length - 1    // Last history message
    ];

    return simulate(messages, {
      provider: "anthropic",
      cachePoints
    });
  }
}
```

### Update Simulator Class

The Simulator also uses caching in legacy:

```typescript
export class Simulator {
  // ... existing properties ...

  async stream() {
    const messages = this.history;

    // Cache the last message
    const cachePoints = [messages.length - 1];

    return simulate(messages, {
      provider: "anthropic",
      cachePoints,
      systemPrompt: this.getSystemPrompt()
    });
  }
}
```

## Vercel AI SDK Support

Check if Vercel AI SDK supports Anthropic caching:

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// May need to pass experimental options
const stream = await streamText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  messages: formattedMessages,
  experimental: {
    cacheControl: true  // Check if this exists
  }
});
```

**Note:** If Vercel AI SDK doesn't support caching, we may need to use the Anthropic SDK directly:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: messagesWithCaching,
});
```

## Testing Prompt Caching

### Verify Caching is Working

Anthropic returns cache usage in response headers:

```typescript
// Check response headers
console.log('Cache read tokens:', response.usage.cache_read_input_tokens);
console.log('Cache creation tokens:', response.usage.cache_creation_input_tokens);
console.log('Regular input tokens:', response.usage.input_tokens);
```

**First Request:**
- `cache_creation_input_tokens`: > 0 (creating cache)
- `cache_read_input_tokens`: 0 (nothing cached yet)

**Subsequent Requests (within 5 min):**
- `cache_creation_input_tokens`: 0
- `cache_read_input_tokens`: > 0 (reading from cache)

### Cost Calculation

**Without Caching:**
- Input tokens: $3 per million tokens
- Output tokens: $15 per million tokens

**With Caching:**
- Cache writes: $3.75 per million tokens (25% markup)
- Cache reads: $0.30 per million tokens (90% discount)
- Regular input tokens: $3 per million tokens
- Output tokens: $15 per million tokens

**Example:**
- 10 requests with 5000 token template
- Without caching: 10 × 5000 × $3/1M = $0.15
- With caching: (5000 × $3.75/1M) + (9 × 5000 × $0.30/1M) = $0.019 + $0.014 = $0.033
- **Savings: 78%**

## Questions to Resolve

1. **Vercel AI SDK Support:** Does `@ai-sdk/anthropic` support prompt caching?
   - If yes: Use their API
   - If no: Use Anthropic SDK directly for cached requests

2. **Cache Strategy:** Should we cache more aggressively?
   - Current: Last template + last history
   - Alternative: All template messages, last N history messages

3. **System Prompts:** How do we handle system prompts with caching?
   - Vercel AI SDK uses `system` parameter
   - Anthropic API wants it as first user message with caching

4. **Performance Monitoring:** How do we track cache hit rates?
   - Add logging?
   - Dashboard metrics?

## Acceptance Criteria

- [ ] Caching support added to `simulate()` function
- [ ] GaslitClaude uses caching for template and history
- [ ] Simulator uses caching for history
- [ ] Cache control properly formatted for Anthropic API
- [ ] Verified caching works (check usage stats)
- [ ] Cost savings observed in practice
- [ ] Documentation updated with caching strategy
- [ ] Fallback for providers that don't support caching

## Testing Steps

1. Enable caching in GaslitClaude
2. Make first request, check response headers for `cache_creation_input_tokens`
3. Within 5 minutes, make second request
4. Check response headers for `cache_read_input_tokens`
5. Verify cache hit (read tokens > 0)
6. Wait 6+ minutes, make third request
7. Verify cache miss (creation tokens > 0 again)
8. Check Anthropic dashboard for cache usage stats

## References

- Anthropic prompt caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Legacy implementation: `legacy-python/api/calls.py:96-125`
- Vercel AI SDK Anthropic provider: https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic
- Cost calculator: https://www.anthropic.com/pricing

## Notes

- Caching only works with Anthropic provider (not OpenRouter)
- 5-minute TTL means cache is useful for rapid iterations
- Most beneficial for GaslitClaude's long template
- Consider making caching optional via env variable for development
