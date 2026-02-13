# Issue 007: API Structure Matching

**Status:** Open
**Priority:** High
**Dependencies:** 001-006 (All core features)
**Blocks:** 008 (Webshell Frontend)

## Description

Ensure the API in `src/api` has all the endpoints from `api-bun` with proper implementations. This is the final integration issue that brings together all the agent implementations.

## Current State

**`api-bun/src/index.ts`:** 15 endpoints (all placeholders)
**`src/api/src/index.ts`:** 2 endpoints (working implementations)

## Endpoint Comparison

### ✅ Already Implemented (Working)
1. `GET /` - Basic health check
2. `POST /manual` - Manual turn with real LLM
3. `POST /reset` - Create new session

### ❌ Present in api-bun (Need Implementation)
4. `GET /user` - Get/create user
5. `POST /auto` - Auto-generate searcher response (Issue 002)
6. `POST /constructor` - Constructor conversation (Issue 003)
7. `GET /summary` - Get constructor summary (Issue 003)
8. `GET /identity` - Get identity initialization (Issue 004)
9. `POST /chat` - Chat with identity (Issue 004)
10. `GET /session` - Get session messages
11. `GET /sessions` - List user sessions
12. `PUT /sessions/{id}/metadata` - Update session metadata
13. `GET /share/{session_id}` - Create share code (Issue 005)
14. `GET /share/messages/{code}` - Get shared messages (Issue 005)
15. `GET /export/{session_id}` - Export conversation as JSON

## Implementation Checklist

### High Priority (Core Functionality)

- [ ] **POST /manual** - ✅ Already working
- [ ] **POST /reset** - ✅ Already working
- [ ] **POST /auto** - Implement using GaslitClaude (Issue 002)
- [ ] **POST /constructor** - Implement using Constructor agent (Issue 003)
- [ ] **POST /chat** - Implement using Identity agent (Issue 004)

### Medium Priority (User Experience)

- [ ] **GET /user** - Simple user creation
- [ ] **GET /session** - Get messages for a session
- [ ] **GET /sessions** - List all user sessions
- [ ] **PUT /sessions/{id}/metadata** - Update session metadata
- [ ] **GET /summary** - Get constructor summaries

### Lower Priority (Nice to Have)

- [ ] **GET /identity** - Preview identity initialization
- [ ] **GET /share/{session_id}** - Share code encryption (Issue 005)
- [ ] **GET /share/messages/{code}** - Retrieve shared messages (Issue 005)
- [ ] **GET /export/{session_id}** - Export as JSON

## Detailed Endpoint Specifications

### GET /user

Simple user lookup/creation:

```typescript
.get("/user", async ({ query, set }) => {
  const { name } = query as { name: string };
  if (!name) {
    set.status = 400;
    return { error: "Name is required" };
  }

  const { data, error } = await supabase
    .from('users')
    .upsert({ name: name })
    .select('id')
    .single();

  if (error) {
    set.status = 500;
    return { error: error.message };
  }

  return { user_id: data.id };
})
```

### GET /session

Get messages for a session (with optional session_id):

```typescript
.get("/session", async ({ query, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = query as { session_id?: string };

  let resolved_session_id = session_id;

  if (!resolved_session_id) {
    // Get latest session
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !sessions || sessions.length === 0) {
      set.status = 404;
      return { error: "No sessions found" };
    }

    resolved_session_id = sessions[0].id;
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', resolved_session_id)
    .eq('user_id', user_id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    set.status = 500;
    return { error: messagesError.message };
  }

  return {
    session_id: resolved_session_id,
    messages: messages.map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      created_at: msg.created_at,
      is_user: msg.is_user,
    }))
  };
})
```

### GET /sessions

List all sessions for a user:

```typescript
.get("/sessions", async ({ query, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { mode } = query as { mode?: string };

  let query = supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });

  // Filter by mode if specified
  if (mode) {
    query = query.filter('metadata->mode', 'eq', mode);
  }

  const { data: sessions, error } = await query;

  if (error) {
    set.status = 500;
    return { error: error.message };
  }

  return sessions;
})
```

### PUT /sessions/{session_id}/metadata

Update session metadata:

```typescript
.put("/sessions/:session_id/metadata", async ({ params, body, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = params;
  const metadata = body as Record<string, any>;

  const { data, error } = await supabase
    .from('sessions')
    .update({ metadata })
    .eq('id', session_id)
    .eq('user_id', user_id)
    .select('*')
    .single();

  if (error) {
    set.status = 500;
    return { error: error.message };
  }

  return {
    session_id: data.id,
    metadata: data.metadata
  };
})
```

### GET /export/{session_id}

Export conversation as JSON:

```typescript
.get("/export/:session_id", async ({ params, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = params;

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session_id)
    .eq('user_id', user_id)
    .order('created_at', { ascending: true });

  if (error) {
    set.status = 500;
    return { error: error.message };
  }

  const formatted_messages = messages.map((msg: any) => ({
    role: msg.is_user ? "user" : "assistant",
    content: msg.content
  }));

  return new Response(JSON.stringify(formatted_messages, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="yousim_conversation_${session_id}.json"`
    }
  });
})
```

## Implementation Order

1. **Phase 1: Core Simulation**
   - ✅ POST /manual (done)
   - ✅ POST /reset (done)
   - POST /auto (Issue 002)

2. **Phase 2: Constructor Mode**
   - POST /constructor (Issue 003)
   - GET /summary (Issue 003)

3. **Phase 3: Identity Chat**
   - POST /chat (Issue 004)
   - GET /identity (Issue 004)

4. **Phase 4: Session Management**
   - GET /user
   - GET /session
   - GET /sessions
   - PUT /sessions/{id}/metadata

5. **Phase 5: Sharing & Export**
   - GET /share/{session_id} (Issue 005)
   - GET /share/messages/{code} (Issue 005)
   - GET /export/{session_id}

## API Documentation

Once complete, consider generating OpenAPI/Swagger docs:

```typescript
import { swagger } from '@elysiajs/swagger'

const app = new Elysia()
  .use(swagger({
    documentation: {
      info: {
        title: 'YouSim API',
        version: '1.0.0',
        description: 'Identity simulation API'
      }
    }
  }))
  // ... rest of app
```

## Testing Matrix

Create test suite covering:

| Endpoint | Anonymous | Authenticated | Wrong User | Invalid Input |
|----------|-----------|---------------|------------|---------------|
| GET / | ✓ | ✓ | N/A | N/A |
| GET /user | ✓ | ✓ | N/A | ✓ |
| POST /reset | ✗ | ✓ | N/A | ✓ |
| POST /manual | ✗ | ✓ | ✗ | ✓ |
| POST /auto | ✗ | ✓ | ✗ | ✓ |
| POST /constructor | ✗ | ✓ | ✗ | ✓ |
| POST /chat | ✗ | ✓ | ✗ | ✓ |
| GET /session | ✗ | ✓ | ✗ | ✓ |
| GET /sessions | ✗ | ✓ | N/A | N/A |
| PUT /sessions/{id}/metadata | ✗ | ✓ | ✗ | ✓ |
| GET /summary | ✗ | ✓ | ✗ | ✓ |
| GET /identity | ✗ | ✓ | ✗ | ✓ |
| GET /share/{id} | ✗ | ✓ | ✗ | ✓ |
| GET /share/messages/{code} | ✓ | ✓ | N/A | ✓ |
| GET /export/{id} | ✗ | ✓ | ✗ | N/A |

## Acceptance Criteria

- [ ] All 15 endpoints implemented
- [ ] All endpoints properly authenticated (where required)
- [ ] Error handling for all edge cases
- [ ] Response types match api-bun signatures
- [ ] Streaming responses work correctly
- [ ] JWT authentication working throughout
- [ ] Database operations use proper transactions where needed
- [ ] API documentation generated
- [ ] Test coverage for all endpoints

## Post-Implementation

Once complete:
- [ ] Delete `api-bun` directory
- [ ] Update README with API documentation
- [ ] Update frontend to use new API
- [ ] Deploy and test in production

## References

- api-bun implementation: `api-bun/src/index.ts`
- Current src/api: `src/api/src/index.ts`
- Legacy Python API: `legacy-python/api/app.py`
