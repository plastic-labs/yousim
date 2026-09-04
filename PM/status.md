# Refactor Status: General-Purpose Distributable YouSim

Branch: `vineeth/refactor`

## Completed

### Phase 1: Storage Abstraction
- `Storage` interface defined in `src/core/src/storage.ts` with types for sessions, messages, summaries, users.
- `MemoryStorage` (in-memory, zero deps) for CLI use.
- `SqliteStorage` (bun:sqlite, `~/.yousim/yousim.db`) for local server use.
- `SupabaseStorage` adapter in `src/api/src/storage/supabase.ts` — extracted all inline Supabase calls.
- `createStorage()` factory with auto-detection (SUPABASE_URL → supabase, else → sqlite).
- All storage types re-exported from `@yousim/core`.

### Phase 2: API Decoupling
- Removed hard `throw` on missing SUPABASE_URL/SUPABASE_KEY — server starts without Supabase.
- Multi-mode auth in `src/api/src/auth.ts`: local (no auth), apikey (Bearer token), supabase (JWT/JWKS).
- All ~20 inline `supabase.from(...)` calls replaced with `storage.*` method calls.
- Added `GET /api/mode` endpoint returning `{ auth: "supabase" | "apikey" | "local" }`.
- Route signatures/responses unchanged — frontend compatibility preserved.

### Phase 3: Provider Expansion (BYOK)
- Added OpenAI and Groq providers to `src/core/src/agents.ts` and `src/core/src/index.ts`.
- Per-provider default models (gpt-4o, llama-3.3-70b-versatile, etc.).
- Updated `.env.template` with `GROQ_API_KEY`, `YOUSIM_API_KEY`.

### Phase 4: CLI Expansion
- Mode selection menu at launch: Simulator / Constructor / Chat.
- `runSimulator()` preserves original simulator behavior.
- `runConstructor()` guides identity construction, generates summary, offers chat transition.
- `runChat()` accepts summary (from constructor or pasted) and runs Identity chat loop.

### Phase 5: v1/construct API
- `POST /v1/construct` — start or continue constructor conversation, returns `{session_id, response, turn, done}`.
- `POST /v1/construct/summary` — generates summary + `identity_md` + `soul_md` from conversation.
- `GET /v1/construct/:id` — get session state, messages, and summary.
- `src/api/src/formatters.ts` — `formatIdentityMd()` and `formatSoulMd()` helpers.
- `src/api/src/detect-done.ts` — heuristic for constructor conversation completion.

### Phase 6: Frontend Local Mode
- `src/frontend/src/api.ts` — Supabase client conditional (null when VITE_SUPABASE_URL not set).
- `getAuthToken()` returns null in local mode; all fetch calls work without Authorization header.
- `src/frontend/src/App.tsx` — Supabase auth (signInAnonymously, onAuthStateChange) wrapped in conditional.
- Frontend works fully without Supabase when served by `yousim server`.

### Phase 7: Publishing + Distribution
- All package.json files updated to version `0.1.0`.
- `@yousim/core`: added `exports` map, `files`, `publishConfig.access: "public"`.
- `@yousim/launcher` renamed to `yousim` (the npm package name for `bunx yousim`).
- Launcher has `config` subcommand showing active settings, storage mode, auth mode.
- `@yousim/cli` and `@yousim/api` have `files` and `publishConfig`.

### Phase 8: OpenClaw Skill
- `openclaw/SKILL.md` — skill manifest with 3 usage modes (interactive, automated, direct API).
- `openclaw/craft-identity.sh` — bash script calling `/v1/construct` API. Supports `--auto` JSON mode and interactive terminal mode. Writes `SOUL.md` and `IDENTITY.md`.

## Needs Validation

- [ ] Run `yousim server` WITHOUT Supabase env vars — verify API works with SQLite
- [ ] Run WITH Supabase env vars — verify existing behavior preserved (backward compat)
- [ ] Run `yousim` CLI — test each mode (simulator, constructor → chat transition)
- [ ] Test BYOK with `PROVIDER=openai` and `PROVIDER=groq`
- [ ] Test `/v1/construct` flow end-to-end with curl
- [ ] Open browser to `yousim server` — verify frontend works without Supabase
- [ ] Test `bunx yousim` from a clean directory
- [ ] Test `bash craft-identity.sh` interactive and `--auto` modes
- [ ] Unit test MemoryStorage and SqliteStorage (insert/query cycles)

## Architecture Changes

```
Before:                              After:
┌─────────┐                         ┌─────────┐
│   CLI   │── only simulator ──►    │   CLI   │── simulator/constructor/chat
└────┬────┘                         └────┬────┘
     │                                   │
┌────┴────┐                         ┌────┴────┐
│  Core   │── anthropic/openrouter  │  Core   │── anthropic/openrouter/openai/groq
└────┬────┘                         │         │── Storage interface
     │                              └────┬────┘── MemoryStorage, SqliteStorage
┌────┴────┐                              │
│   API   │── hard Supabase dep     ┌────┴────┐
│         │── crashes without env   │   API   │── pluggable storage (sqlite/supabase)
└─────────┘                         │         │── multi-mode auth (local/apikey/supabase)
                                    │         │── /v1/construct API
                                    └─────────┘
                                    ┌─────────┐
                                    │Frontend │── works with or without Supabase
                                    └─────────┘
                                    ┌─────────┐
                                    │OpenClaw │── SKILL.md + craft-identity.sh
                                    └─────────┘
```

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/core/src/storage.ts` | New | Storage interface + types |
| `src/core/src/storage/memory.ts` | New | In-memory storage |
| `src/core/src/storage/sqlite.ts` | New | SQLite storage (bun:sqlite) |
| `src/core/src/storage/index.ts` | New | Factory + re-exports |
| `src/core/src/agents.ts` | Modified | Added openai/groq providers |
| `src/core/src/index.ts` | Modified | Re-export storage, added providers |
| `src/api/src/auth.ts` | New | Multi-mode auth |
| `src/api/src/storage/supabase.ts` | New | Supabase storage adapter |
| `src/api/src/formatters.ts` | New | identity_md/soul_md formatters |
| `src/api/src/detect-done.ts` | New | Constructor done heuristic |
| `src/api/src/index.ts` | Modified | Major refactor + v1 endpoints |
| `src/cli/src/cli.ts` | Modified | Added constructor + chat modes |
| `src/frontend/src/api.ts` | Modified | Local mode auth bypass |
| `src/frontend/src/App.tsx` | Modified | Conditional Supabase auth |
| `src/launcher/src/index.ts` | Modified | Config subcommand |
| `openclaw/SKILL.md` | New | OpenClaw skill manifest |
| `openclaw/craft-identity.sh` | New | Identity crafting script |
| `.env.template` | Modified | Added GROQ_API_KEY, YOUSIM_API_KEY |
| All `package.json` | Modified | Versions, exports, publishConfig |
