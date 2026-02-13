# Issue 003: Constructor Endpoint Implementation

**Status:** Open
**Priority:** High
**Dependencies:** 001 (Core Agents)
**Blocks:** 004 (Chat Endpoint)

## Description

Implement the `/constructor` endpoint that helps users build custom identities through guided conversation. This is a key feature that allows users to define their own simulated identities.

## Legacy Implementation

**File:** `legacy-python/api/app.py:271-276`

**Flow:**
1. Load constructor conversation history
2. Add user's message to constructor history
3. Stream response from Constructor agent
4. Store both messages in database
5. **Generate summary** of the conversation so far
6. Store summary as metamessage (NOTE: We're removing metamessages, see below)

## Endpoint Specification

### Route
```
POST /constructor
```

### Request Body
```typescript
{
  session_id: string,
  command: string  // User's response to the constructor's question
}
```

### Response
- Streaming text response from Constructor agent

### Authentication
- Requires valid JWT token
- Uses `get_current_user()` helper

## Implementation Details

### Process Flow

1. **Load History:**
   - Fetch all messages for the constructor session
   - Convert to Constructor agent history format

2. **Generate Response:**
   - Create Constructor instance with history
   - Add user's command to history
   - Stream response from Constructor

3. **Store Messages:**
   - Store user message (is_user=true)
   - Store constructor response (is_user=false)

4. **Generate and Store Summary:**
   - Create Summary agent instance
   - Generate summary of entire conversation
   - **NEW:** Store summary in session metadata OR new summaries table
   - Return summary reference for later use

### Summary Storage Options

Since we're removing metamessages/Honcho, we have several options:

**Option A: Session Metadata**
```typescript
// Update session metadata with latest summary
await supabase
  .from('sessions')
  .update({
    metadata: {
      ...existingMetadata,
      latest_summary: summaryText,
      summary_updated_at: new Date().toISOString()
    }
  })
  .eq('id', session_id);
```

**Option B: New Summaries Table**
```sql
CREATE TABLE summaries (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Option C: Special Message Type**
```typescript
// Store as a message with a special flag
await supabase
  .from('messages')
  .insert({
    session_id,
    user_id,
    content: summaryText,
    is_user: false,
    message_type: 'summary'  // Add message_type column
  });
```

**Recommendation:** Option B (separate table) is cleanest and most flexible.

### Constructor Session Flow

1. User calls `/reset` with `mode=constructor`
2. User sends messages via `/constructor` endpoint
3. Constructor asks guided questions (one at a time)
4. After each turn, summary is updated
5. When done, user can use summary to instantiate identity via `/chat`

## Code Template

```typescript
.post("/constructor", async ({ body, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id, command } = body as ManualRequest;

  // 1. Load constructor history
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    set.status = 500;
    return { error: messagesError.message };
  }

  // 2. Convert to constructor history
  const constructorHistory: Message[] = messages.map((msg: any) => ({
    role: msg.is_user ? "user" : "assistant",
    content: msg.content
  }));

  // 3. Create constructor and generate response
  const constructor = new Constructor({ history: constructorHistory });
  constructor.history.push({ role: "user", content: command });

  const stream = constructor.stream();
  let constructorResponse = "";

  // 4. Collect response
  for await (const chunk of stream) {
    constructorResponse += chunk;
  }

  // 5. Store messages
  const { data: userMessage } = await supabase
    .from('messages')
    .insert({
      session_id,
      user_id,
      content: command,
      is_user: true
    })
    .select()
    .single();

  await supabase
    .from('messages')
    .insert({
      session_id,
      user_id,
      content: constructorResponse,
      is_user: false
    });

  // 6. Generate and store summary
  const summaryAgent = new Summary({
    history: [...constructorHistory,
      { role: "user", content: command },
      { role: "assistant", content: constructorResponse }
    ]
  });

  const summaryStream = summaryAgent.stream();
  let summaryText = "";
  for await (const chunk of summaryStream) {
    summaryText += chunk;
  }

  // 7. Store summary (choose option A, B, or C above)
  // TODO: Implement based on chosen storage strategy

  // 8. Return streaming response
  return new Response(constructorResponse, {
    headers: {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked'
    }
  });
}, {
  body: t.Object({
    session_id: t.String(),
    command: t.String()
  })
})
```

## Additional Endpoints Needed

### Get Latest Summary

```typescript
GET /constructor/summary?session_id=<id>
```

Returns the latest summary for a constructor session. Needed for:
- Viewing progress
- Passing to `/chat` endpoint for identity instantiation

## Questions to Resolve

1. **Summary Storage:** Which option (A, B, or C) should we use?
   - Recommendation: Option B (separate table)

2. **Summary Format:** Should we extract content from `<summary>` tags?
   - Legacy stores raw output with tags
   - Could parse and store just the content

3. **Constructor Initial Message:** Should we send an initial message from Constructor when creating a constructor session?
   - Legacy Python has initial messages in the class
   - Could add to `/reset` when mode=constructor

## Acceptance Criteria

- [ ] `/constructor` endpoint implemented
- [ ] Constructor agent properly initialized with history
- [ ] User messages and constructor responses stored
- [ ] Summary generated after each turn
- [ ] Summary stored (using chosen strategy)
- [ ] `/constructor/summary` endpoint to retrieve summaries
- [ ] Proper error handling
- [ ] JWT authentication working
- [ ] Streaming response works correctly

## Database Schema Changes

If using Option B (recommended):

```sql
-- Add to Supabase migrations
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_summaries_session ON summaries(session_id);
CREATE INDEX idx_summaries_user ON summaries(user_id);
```

## Testing Steps

1. Create constructor session: `POST /reset?mode=constructor`
2. Send first message: `POST /constructor` with session_id and command
3. Verify constructor response asks a question
4. Check database for stored messages and summary
5. Send follow-up messages to continue conversation
6. Retrieve summary: `GET /constructor/summary?session_id=<id>`
7. Use summary to create identity chat session (Issue 004)

## References

- Legacy implementation: `legacy-python/api/app.py:271-276`
- Constructor class: Issue 001
- Summary class: Issue 001
- Chat endpoint (uses summaries): Issue 004
