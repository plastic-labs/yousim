# Issue 001: Core Agent Classes Implementation

**Status:** Open
**Priority:** High
**Dependencies:** None
**Blocks:** 002, 003, 004

## Description

Implement the core agent classes that were present in the legacy Python implementation. These agents handle different types of conversations and identity simulation.

## Required Agents

### 1. GaslitClaude (Searcher)

**Purpose:** The "searcher" Claude that asks questions and explores the simulated identity.

**Legacy Implementation:** `legacy-python/api/calls.py:38-137`

**Functionality:**
- Uses a meta-prompt that gaslights Claude into thinking it's exploring a simulation
- Has access to "insights" about the identity being simulated
- Generates questions and commands to send to the simulator
- Uses prompt caching for the template messages

**Key Features:**
- Template with OOC (out of character) setup
- History tracking for conversation
- Support for Anthropic (with caching) and OpenRouter providers
- Name and insights context

### 2. Constructor

**Purpose:** Chat assistant that helps users build custom identities through guided conversation.

**Legacy Implementation:** `legacy-python/api/calls.py:192-221`

**Functionality:**
- Guides users through questions to define their desired identity
- Asks one question at a time with numbered choices or yes/no answers
- Conversation serves as source material for generating the final identity

**Key Features:**
- Initial system message that explains the constructor role
- History tracking
- Originally used Groq, but should support configurable providers

### 3. Summary

**Purpose:** Summarizes constructor conversations to create identity seeds.

**Legacy Implementation:** `legacy-python/api/calls.py:224-249`

**Functionality:**
- Takes a conversation history from the constructor
- Generates a summary in XML tags `<summary></summary>`
- Summary is formatted as instructions/lore for seeding the identity

**Key Features:**
- Initial prompt explains the summarization task
- Outputs structured XML format
- Originally used Groq, but should support configurable providers

### 4. SummaryFollowUp

**Purpose:** Affirms the identity based on the summary.

**Legacy Implementation:** `legacy-python/api/calls.py:252-274`

**Functionality:**
- Takes the summary and the agent's initial response
- Creates an affirmation message to prepare the identity
- Focuses only on the identity (no self-explanation)

**Key Features:**
- Single-turn completion
- Prepares identity for user interaction

### 5. Identity

**Purpose:** Complex multi-step identity initialization system.

**Legacy Implementation:** `legacy-python/api/calls.py:277-398`

**Functionality:**
- Most complex agent class
- Multi-step initialization process:
  1. "Who are you?" → "I don't know who I am"
  2. Provide summary → Agent responds
  3. Get follow-up affirmation → Agent responds
  4. Connect to user with first message
- Removes asterisk-wrapped emoting text
- Can accept pre-built prompts or generate them

**Key Features:**
- 4-step initialization sequence
- Text cleaning (remove asterisks)
- History tracking for ongoing conversation
- Support for custom prompts

## Implementation Plan

### File Structure

Create new file: `src/core/src/agents.ts`

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export class GaslitClaude {
  // Implementation
}

export class Constructor {
  // Implementation
}

export class Summary {
  // Implementation
}

export class SummaryFollowUp {
  // Implementation
}

export class Identity {
  // Implementation
}
```

### Key Design Decisions

1. **Provider Support:** All agents should support both Anthropic and OpenRouter (no Groq requirement since we can use OpenRouter for any model)

2. **Streaming vs Non-Streaming:**
   - GaslitClaude, Constructor, Identity: Should stream
   - Summary, SummaryFollowUp: Can be non-streaming (single completion)

3. **Prompt Caching:** Implement caching for GaslitClaude template (see issue 006)

4. **Error Handling:** All agents should have proper error handling and logging

5. **Type Safety:** Use TypeScript interfaces for all message formats

## Acceptance Criteria

- [ ] All 5 agent classes implemented in `src/core/src/agents.ts`
- [ ] Each agent properly exports its class
- [ ] Support for both Anthropic and OpenRouter providers
- [ ] Streaming implemented where needed
- [ ] Error handling for API failures
- [ ] TypeScript types for all parameters and return values
- [ ] Tests for basic functionality (optional but recommended)

## References

- Legacy Python implementation: `legacy-python/api/calls.py`
- Core simulate function: `src/core/src/index.ts`
- Existing Message interface: `src/core/src/index.ts:16-19`

## Notes

- Consider reusing the existing `simulate()` function where possible
- The `completion_handler` utility from Python can be adapted to TypeScript
- Remove asterisk content functionality should be a utility function
