# Issue 004: Chat Endpoint Implementation

**Status:** Open
**Priority:** High
**Dependencies:** 001 (Core Agents), 003 (Constructor - for summaries)
**Blocks:** None

## Description

Implement the `/chat` endpoint that allows users to chat with instantiated identities created via the constructor. This is the culmination of the identity construction process.

## Legacy Implementation

**File:** `legacy-python/api/app.py:584-666`

**Flow:**
1. Retrieve the summary from the constructor session
2. Get or create the identity prompt (4-step initialization)
3. Load chat history for the current chat session
4. Create Identity instance with summary, user input, and optional prompt
5. Stream response from identity
6. Store both user and identity messages

## Endpoint Specification

### Route
```
POST /chat
```

### Request Body
```typescript
{
  session_id: string,           // Current chat session
  command: string,              // User's message
  original_session_id: string,  // Constructor session ID
  summary_id: string,           // Summary identifier
  summary_message_id: string,   // (Legacy field, may not be needed)
  prompt?: Array<{role: string, content: string}>  // Optional pre-built prompt
}
```

### Response
- Streaming text response from Identity agent

### Authentication
- Requires valid JWT token
- Uses `get_current_user()` helper

## Implementation Details

### Process Flow

1. **Retrieve Summary:**
   - Fetch summary from summaries table (or session metadata)
   - Use `original_session_id` to find the constructor session
   - Get the latest summary for that session

2. **Get Identity Prompt:**
   - If `prompt` provided, use it
   - Otherwise, use stored prompt from session metadata
   - If no stored prompt, Identity class will generate it

3. **Load Chat History:**
   - Fetch all messages from current chat session
   - Convert to Identity agent history format

4. **Create Identity:**
   - Initialize Identity with summary, user message, and optional prompt
   - Set history from loaded messages
   - Stream response

5. **Store Messages:**
   - Store user message (is_user=true)
   - Store identity response (is_user=false)

### Identity Prompt Storage

The Identity class generates a complex 4-step prompt on first initialization. We should cache this:

**Option A: Session Metadata**
```typescript
await supabase
  .from('sessions')
  .update({
    metadata: {
      ...existingMetadata,
      identity_prompt: identityPromptArray,
      constructor_session_id: original_session_id,
      summary_id: summary_id
    }
  })
  .eq('id', session_id);
```

**Option B: New Prompts Table**
```sql
CREATE TABLE identity_prompts (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  constructor_session_id UUID,
  prompt JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Recommendation:** Option A (session metadata) since it's session-specific data.

### Chat Session Creation Flow

1. User completes constructor conversation
2. User calls `/identity` endpoint to get identity prompt (new endpoint needed)
3. User calls `/reset` with metadata linking to constructor session
4. User calls `/chat` to interact with the identity

## Code Template

```typescript
.post("/chat", async ({ body, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const {
    session_id,
    command,
    original_session_id,
    summary_id,
    prompt
  } = body as ChatRequest;

  // 1. Get summary from constructor session
  const { data: summary, error: summaryError } = await supabase
    .from('summaries')
    .select('content')
    .eq('session_id', original_session_id)
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (summaryError || !summary) {
    set.status = 404;
    return { error: "Summary not found" };
  }

  // 2. Get session to check for cached prompt
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', user_id)
    .single();

  if (sessionError) {
    set.status = 400;
    return { error: "Invalid chat session" };
  }

  // 3. Get or use cached identity prompt
  let identityPrompt = prompt;
  if (!identityPrompt && session.metadata?.identity_prompt) {
    identityPrompt = session.metadata.identity_prompt;
  }

  // 4. Load chat history
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    set.status = 500;
    return { error: messagesError.message };
  }

  const chatHistory: Message[] = messages.map((msg: any) => ({
    role: msg.is_user ? "user" : "assistant",
    content: msg.content
  }));

  // 5. Create Identity instance
  const identity = new Identity(
    summary.content,
    command,
    identityPrompt
  );
  identity.history = chatHistory;

  // 6. Stream response
  const stream = identity.stream();
  let responseText = "";

  for await (const chunk of stream) {
    responseText += chunk;
  }

  // 7. Store messages
  await supabase
    .from('messages')
    .insert({
      session_id,
      user_id,
      content: command,
      is_user: true
    });

  await supabase
    .from('messages')
    .insert({
      session_id,
      user_id,
      content: responseText,
      is_user: false
    });

  // 8. Cache prompt if not already cached
  if (!session.metadata?.identity_prompt && identity.getPrompt) {
    await supabase
      .from('sessions')
      .update({
        metadata: {
          ...session.metadata,
          identity_prompt: identity.getPrompt(),
          constructor_session_id: original_session_id,
          summary_id: summary_id
        }
      })
      .eq('id', session_id);
  }

  // 9. Return streaming response
  return new Response(responseText, {
    headers: {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked'
    }
  });
}, {
  body: t.Object({
    session_id: t.String(),
    command: t.String(),
    original_session_id: t.String(),
    summary_id: t.String(),
    summary_message_id: t.String(),
    prompt: t.Optional(t.Array(t.Object({
      role: t.String(),
      content: t.String()
    })))
  })
})
```

## Additional Endpoints Needed

### Get Identity Initialization

```typescript
GET /identity?session_id=<constructor_session_id>&message_id=<id>&metamessage_id=<id>
```

Returns the 4-step identity initialization prompt. Used by frontend to:
- Preview the identity before chatting
- Cache the prompt for reuse
- Understand what the identity will be like

**Implementation:**
```typescript
.get("/identity", async ({ query, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = query as { session_id: string };

  // Get latest summary
  const { data: summary, error } = await supabase
    .from('summaries')
    .select('content')
    .eq('session_id', session_id)
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !summary) {
    set.status = 404;
    return { error: "Summary not found" };
  }

  // Create identity with empty user input to get prompt
  const identity = new Identity(summary.content, "");
  const prompt = identity.getPrompt();

  return prompt;
})
```

## Questions to Resolve

1. **Prompt Caching:** Should we always cache the identity prompt in session metadata?
   - Pro: Faster subsequent calls
   - Con: Takes up space in metadata
   - Recommendation: Yes, cache it

2. **Summary ID:** The `summary_id` field seems redundant with `original_session_id`. Can we simplify?
   - Could use just `original_session_id` to look up latest summary
   - Keep for backward compatibility?

3. **Streaming:** Should we stream in real-time or collect then return?
   - Legacy streams in real-time
   - Current implementation collects then returns
   - Recommendation: Implement proper streaming for better UX

## Acceptance Criteria

- [ ] `/chat` endpoint implemented
- [ ] Retrieves summary from constructor session
- [ ] Creates Identity instance with correct initialization
- [ ] Loads and uses chat history
- [ ] Streams response from identity
- [ ] Stores both messages in database
- [ ] Caches identity prompt in session metadata
- [ ] `/identity` endpoint implemented for prompt preview
- [ ] Proper error handling
- [ ] JWT authentication working
- [ ] Real-time streaming works

## Database Schema Changes

No new tables needed if using session metadata for prompt storage.

If using separate table:

```sql
CREATE TABLE identity_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  constructor_session_id UUID NOT NULL,
  prompt JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_identity_prompts_session ON identity_prompts(session_id);
```

## Testing Steps

1. Complete a constructor conversation (Issue 003)
2. Get summary: `GET /constructor/summary?session_id=<constructor_id>`
3. Preview identity: `GET /identity?session_id=<constructor_id>`
4. Create chat session: `POST /reset` with metadata
5. Start chat: `POST /chat` with constructor reference
6. Verify identity responds in character
7. Send multiple messages to test history tracking
8. Check that prompt is cached in session metadata

## References

- Legacy implementation: `legacy-python/api/app.py:584-666`
- Identity class: Issue 001
- Constructor/Summary: Issue 003
- Identity initialization: `legacy-python/api/calls.py:277-398`
