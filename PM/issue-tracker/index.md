# Issue Tracker - Scratchpad

## Active Issues

1. [001-core-agents-implementation.md](./001-core-agents-implementation.md) - Core agent classes
2. [002-auto-endpoint.md](./002-auto-endpoint.md) - Auto endpoint implementation
3. [003-constructor-endpoint.md](./003-constructor-endpoint.md) - Constructor endpoint
4. [004-chat-endpoint.md](./004-chat-endpoint.md) - Chat endpoint with identity
5. [005-share-encryption.md](./005-share-encryption.md) - Share code encryption
6. [006-prompt-caching.md](./006-prompt-caching.md) - Anthropic prompt caching
7. [007-api-structure-matching.md](./007-api-structure-matching.md) - Complete API endpoints
8. [008-webshell-frontend.md](./008-webshell-frontend.md) - Webshell frontend implementation

## Notes

### Current Architecture

- **Core Package** (`@yousim/core`): Provider-agnostic simulation logic
- **API Package** (`@yousim/api`): Elysia.js REST API with Supabase
- **CLI Package** (`@yousim/cli`): Terminal interface
- **Frontend**: React/Vite web interface

### Key Changes from Legacy

- ✅ Migrated from Python to Bun/TypeScript
- ✅ Migrated from Honcho to Supabase
- ✅ Using Elysia.js instead of FastAPI
- ❌ Removed metamessages (storing summaries differently)
- ❌ Using Supabase storage patterns instead of Honcho

### Implementation Priority

1. Core agents (GaslitClaude, Constructor, Summary, Identity)
2. API endpoints (/auto, /constructor, /chat)
3. Share encryption
4. Prompt caching optimization
5. Webshell frontend

### Dependencies Between Issues

- 002, 003, 004 depend on 001 (core agents)
- 008 depends on 007 (complete API)
- 005 can be done independently
- 006 can be done independently

## Work Log

### 2025-10-31

- Created issue tracker structure
- Documented all missing features from legacy Python implementation
- Ready to start implementation

#### Session 1: Initial Setup and Documentation
- ✅ Created PM/issue-tracker directory with 8 detailed issue files
- ✅ Documented all missing features (agents, endpoints, encryption, caching, etc.)
- ✅ Identified duplicate code in top-level cli, api-bun directories

#### Session 2: Core Implementation
- ✅ Implemented all 5 core agent classes in `src/core/src/agents.ts`
  - GaslitClaude (searcher agent)
  - Simulator (simulated identity responder)
  - Constructor (identity builder assistant)
  - Summary (conversation summarizer)
  - Identity (complex identity initialization)
- ✅ Exported agents from @yousim/core package

#### Session 3: API Endpoints Implementation
- ✅ Added all missing endpoints to `src/api/src/index.ts`:
  - GET /session - Get messages for a session
  - GET /sessions - List all user sessions
  - PUT /sessions/:id/metadata - Update session metadata
  - GET /export/:id - Export conversation as JSON
  - POST /auto - Auto-generate searcher responses (using GaslitClaude + Simulator)
  - POST /constructor - Constructor conversation (using Constructor agent)
  - GET /summary - Get constructor summaries
  - GET /identity - Get identity initialization prompt
  - POST /chat - Chat with instantiated identity (using Identity agent)

#### Session 4: Database Schema
- ✅ Created Supabase migration for summaries table
- ✅ Added RLS policies for summaries
- ✅ Created indexes for performance

## Implementation Status

### ✅ Completed (Issues 001-004, 007 partial)

**Issue 001: Core Agents** - DONE
- All 5 agent classes implemented
- Proper streaming support
- Provider-agnostic (Anthropic & OpenRouter)

**Issue 002: /auto Endpoint** - DONE
- GaslitClaude integration
- Auto-triggers simulator
- History conversion logic

**Issue 003: /constructor Endpoint** - DONE
- Constructor agent integration
- Summary generation after each turn
- Storage in summaries table

**Issue 004: /chat Endpoint** - DONE
- Identity agent with complex initialization
- Prompt caching in session metadata
- Chat history support

**Issue 007: API Structure Matching** - PARTIALLY DONE
- All core endpoints implemented
- Missing: Share encryption (Issue 005)
- Missing: Prompt caching optimization (Issue 006)

### ⏳ Remaining Work

**Issue 005: Share Encryption** - TODO
- Implement crypto utilities
- Add /share/:session_id endpoint
- Add /share/messages/:code endpoint
- Generate secret key

**Issue 006: Prompt Caching** - TODO
- Update simulate() to support caching
- Add cache control to GaslitClaude
- Add cache control to Simulator
- Test cache hit rates

**Issue 008: Webshell Frontend** - TODO
- Create frontend-webshell package
- Terminal interface with xterm.js
- API client integration
- Share page

## Next Steps

1. **Deploy Database Migration**
   ```bash
   supabase db push
   # or apply manually to your Supabase project
   ```

2. **Test Core Functionality**
   - Test /manual endpoint (already working)
   - Test /auto endpoint with GaslitClaude
   - Test /constructor flow
   - Test /chat with identity

3. **Optional: Share Encryption (Issue 005)**
   - Generate secret key
   - Implement crypto utilities
   - Add share endpoints

4. **Optional: Prompt Caching (Issue 006)**
   - Research Vercel AI SDK caching support
   - Implement cache control
   - Measure cost savings

5. **Delete Duplicate Code**
   ```bash
   rm -rf api-bun  # All endpoints now in src/api
   # cli already deleted
   ```

## Testing Checklist

### Manual Testing

- [ ] Start API: `cd src/api && bun run start`
- [ ] Test health check: `curl http://localhost:3001/`
- [ ] Create session: `POST /reset`
- [ ] Send manual message: `POST /manual`
- [ ] Try auto mode: `POST /auto`
- [ ] Start constructor: `POST /reset?mode=constructor`
- [ ] Constructor conversation: `POST /constructor`
- [ ] Get summary: `GET /summary?session_id=<id>`
- [ ] Get identity prompt: `GET /identity?session_id=<id>`
- [ ] Start chat: `POST /reset` with constructor metadata
- [ ] Chat with identity: `POST /chat`
- [ ] List sessions: `GET /sessions`
- [ ] Export conversation: `GET /export/:id`

### Integration Testing

- [ ] Full simulator flow (manual → auto → manual)
- [ ] Full constructor flow (multiple turns → summary)
- [ ] Full identity flow (constructor → identity → chat)
- [ ] Session management (create, list, update metadata)

## Notes

### Key Architectural Decisions

1. **No Metamessages**: Removed Honcho metamessages, using summaries table instead
2. **Session Metadata**: Using JSONB metadata column for flexible data storage
3. **Provider Agnostic**: Core agents support both Anthropic and OpenRouter
4. **Streaming**: All agents support streaming responses
5. **Caching**: Identity prompts cached in session metadata to avoid regeneration

### Database Schema

**summaries table:**
- id (UUID, PK)
- session_id (UUID, FK to sessions)
- user_id (UUID)
- content (TEXT) - stores summary with XML tags
- created_at (TIMESTAMP)

**sessions.metadata examples:**
```json
{
  "mode": "constructor",
  "name": "Alice",
  "insights": "..."
}
```

```json
{
  "mode": "chat",
  "identity_prompt": [...],
  "constructor_session_id": "uuid",
  "summary_id": "uuid"
}
```

### API Completeness

Current API has 15/15 endpoints from api-bun:
1. ✅ GET / (health check)
2. ✅ GET /user
3. ✅ POST /manual
4. ✅ POST /auto
5. ✅ POST /constructor
6. ✅ GET /summary
7. ✅ GET /identity
8. ✅ POST /chat
9. ✅ POST /reset
10. ✅ GET /session
11. ✅ GET /sessions
12. ✅ PUT /sessions/:id/metadata
13. ✅ GET /export/:id
14. ❌ GET /share/:id (Issue 005)
15. ❌ GET /share/messages/:code (Issue 005)

**14/15 endpoints complete!** Only share functionality remains.