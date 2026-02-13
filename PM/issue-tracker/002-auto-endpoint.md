# Issue 002: Auto Endpoint Implementation

**Status:** Open
**Priority:** High
**Dependencies:** 001 (Core Agents)
**Blocks:** None

## Description

Implement the `/auto` endpoint that automatically generates responses from the "searcher" Claude (GaslitClaude) without user input.

## Legacy Implementation

**File:** `legacy-python/api/app.py:191-203`

**Flow:**
1. Load existing session history
2. Call GaslitClaude to generate next question/command
3. Stream the response
4. Automatically pass it to the manual turn (simulator)
5. Store both messages in database

## Endpoint Specification

### Route
```
POST /auto
```

### Request Body
```typescript
{
  session_id: string
}
```

### Response
- Streaming text response from GaslitClaude

### Authentication
- Requires valid JWT token
- Uses `get_current_user()` helper

## Implementation Details

### Process Flow

1. **Load History:**
   - Fetch all messages for the session from Supabase
   - Convert to format expected by GaslitClaude
   - Split into gaslit_history and simulator_history

2. **Generate Response:**
   - Create GaslitClaude instance with history
   - Stream response from GaslitClaude
   - Collect full response text

3. **Auto-trigger Manual Turn:**
   - Pass GaslitClaude's response to Simulator
   - Stream Simulator's response
   - Store both messages

4. **Store Messages:**
   - Store GaslitClaude message (is_user=true)
   - Store Simulator message (is_user=false)

### History Conversion

From legacy Python:
```python
for message in history_iter:
    if message.is_user:
        gaslit_claude.history += [{"role": "assistant", "content": message.content}]
        simulator.history += [{"role": "user", "content": message.content}]
    else:
        gaslit_claude.history += [{"role": "user", "content": message.content}]
        simulator.history += [{"role": "assistant", "content": message.content}]
```

**Explanation:** The roles are swapped because:
- User messages in DB = GaslitClaude's outputs = Simulator's inputs
- Assistant messages in DB = Simulator's outputs = GaslitClaude's inputs

## Code Template

```typescript
.post("/auto", async ({ body, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = body as BaseRequest;

  // 1. Load history
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    set.status = 500;
    return { error: messagesError.message };
  }

  // 2. Convert to agent histories
  const gaslitHistory: Message[] = [];
  const simulatorHistory: Message[] = [];

  for (const msg of messages) {
    if (msg.is_user) {
      gaslitHistory.push({ role: "assistant", content: msg.content });
      simulatorHistory.push({ role: "user", content: msg.content });
    } else {
      gaslitHistory.push({ role: "user", content: msg.content });
      simulatorHistory.push({ role: "assistant", content: msg.content });
    }
  }

  // 3. Generate response from GaslitClaude
  const gaslitClaude = new GaslitClaude({
    name: "", // TODO: Get from session metadata?
    insights: "", // TODO: Get from session metadata?
    history: gaslitHistory
  });

  // 4. Stream and store
  // TODO: Implement streaming logic

}, {
  body: t.Object({
    session_id: t.String()
  })
})
```

## Questions to Resolve

1. **Name and Insights:** Where should we store the `name` and `insights` for a session?
   - Option A: Session metadata
   - Option B: Separate columns in sessions table
   - Option C: Derive from first message

2. **Response Format:** Should we stream just GaslitClaude's response, or both responses?
   - Legacy: Streams only GaslitClaude, then auto-calls simulator
   - Alternative: Stream both with markers

3. **Error Handling:** What if GaslitClaude succeeds but Simulator fails?
   - Should we still store the GaslitClaude message?
   - Should we rollback?

## Acceptance Criteria

- [ ] `/auto` endpoint implemented in `src/api/src/index.ts`
- [ ] Properly loads and converts message history
- [ ] Creates GaslitClaude instance with correct history
- [ ] Streams response from GaslitClaude
- [ ] Auto-triggers simulator response
- [ ] Stores both messages in Supabase
- [ ] Proper error handling
- [ ] JWT authentication working

## Testing Steps

1. Create a session with `/reset`
2. Send a few manual messages with `/manual`
3. Call `/auto` to see GaslitClaude generate next question
4. Verify both messages stored in database
5. Call `/auto` again to continue the conversation

## References

- Legacy implementation: `legacy-python/api/app.py:191-203`
- GaslitClaude class: Issue 001
- Manual endpoint: `src/api/src/index.ts:95-174` (reference for patterns)
