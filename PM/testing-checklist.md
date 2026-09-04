# Testing Checklist: YouSim Refactor

Run through these tests after the refactor to verify everything works.
Each section is independent — skip sections for features you don't need to test right now.

## Prerequisites

```bash
bun install
cp .env.template .env
# Set at minimum: PROVIDER=anthropic and ANTHROPIC_API_KEY=sk-...
```

Make sure no `SUPABASE_URL` or `SUPABASE_KEY` are set in `.env` unless you're specifically testing Supabase mode.

---

## 1. API — Local Mode (no Supabase)

Unset Supabase vars if present, then start the server:

```bash
# Confirm these are NOT set
unset SUPABASE_URL SUPABASE_KEY YOUSIM_API_KEY

bun run start:api
```

- [ ] Server starts without crashing (was a hard throw before)
- [ ] `curl localhost:3000/api/health` returns `"YouSim API - Bun/Elysia version"`
- [ ] `curl localhost:3000/api/mode` returns `{"auth":"local"}`

Create a session and send a command:

```bash
# Create session
curl -s localhost:3000/reset?mode=simulator -X POST | jq .
# Should return { user_id: "local", session_id: "..." }

# Save the session_id, then:
curl -s localhost:3000/manual \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_HERE","command":"/locate Claude"}'
# Should stream a simulator response
```

- [ ] `/reset` creates session without auth
- [ ] `/manual` streams a response
- [ ] `/sessions` returns the session list
- [ ] SQLite DB created at `~/.yousim/yousim.db`

---

## 2. API — API Key Mode

```bash
export YOUSIM_API_KEY=test-key-123
bun run start:api
```

- [ ] `curl localhost:3000/api/mode` returns `{"auth":"apikey"}`
- [ ] Request without header → 401: `curl -s localhost:3000/sessions`
- [ ] Request with wrong key → 401: `curl -s -H "Authorization: Bearer wrong" localhost:3000/sessions`
- [ ] Request with correct key → 200: `curl -s -H "Authorization: Bearer test-key-123" localhost:3000/sessions`

---

## 3. API — Supabase Mode (if applicable)

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-anon-key
bun run start:api
```

- [ ] `curl localhost:3000/api/mode` returns `{"auth":"supabase"}`
- [ ] Requests with valid Supabase JWT work
- [ ] Existing frontend auth flow still works

---

## 4. v1/construct API

Start server in local mode (no auth), then test the full construct flow:

```bash
# Turn 1: start a new session
curl -s localhost:3000/v1/construct \
  -H "Content-Type: application/json" \
  -d '{"message":"Nova"}' | jq .
# Should return: { session_id, response, turn: 1, done: false }
```

- [ ] First call creates session and returns constructor question
- [ ] `session_id` is present in response

```bash
# Turn 2+: continue with session_id
curl -s localhost:3000/v1/construct \
  -H "Content-Type: application/json" \
  -d '{"message":"3","session_id":"SESSION_ID"}' | jq .
```

- [ ] Subsequent turns increment turn count
- [ ] Constructor asks follow-up questions

```bash
# Get session state
curl -s localhost:3000/v1/construct/SESSION_ID | jq .
```

- [ ] Returns messages, turn count, metadata

```bash
# Generate summary
curl -s localhost:3000/v1/construct/summary \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID","name":"Nova"}' | jq .
```

- [ ] Returns `summary`, `identity_md`, `soul_md`
- [ ] `identity_md` contains `# Identity: Nova`
- [ ] `soul_md` is clean extracted summary content

---

## 5. CLI — Mode Selection

```bash
cd src/cli
bun run start
```

- [ ] Welcome message appears
- [ ] Mode selection menu shows (1/2/3)
- [ ] Entering "1" or empty → starts Simulator mode
- [ ] Entering "2" → starts Constructor mode
- [ ] Entering "3" → starts Chat mode

---

## 6. CLI — Simulator Mode

Select mode 1, then:

- [ ] Initial exchange displays (SEARCHER CLAUDE + SIMULATOR CLAUDE prompts)
- [ ] "Enter a name:" prompt appears
- [ ] After entering a name, `/locate {name}` is sent automatically
- [ ] Simulator responds with styled output
- [ ] Typing a command sends it to the simulator
- [ ] Pressing Enter on empty line triggers auto mode (SEARCHER CLAUDE generates command)
- [ ] "exit" quits cleanly

---

## 7. CLI — Constructor Mode

Select mode 2, then:

- [ ] "What name should this identity have?" prompt appears
- [ ] After entering a name, Constructor asks first question
- [ ] Answering questions continues the conversation
- [ ] Typing "done" generates a summary
- [ ] Summary text is displayed
- [ ] "Would you like to chat with this identity?" prompt appears
- [ ] Answering "yes" transitions to Chat mode

---

## 8. CLI — Chat Mode

Either transition from Constructor (test 7) or select mode 3 directly:

If standalone (mode 3):
- [ ] Prompts for summary text (paste + Enter twice)
- [ ] Prompts for identity name
- [ ] "Initializing identity..." message appears

In chat:
- [ ] First response from identity arrives
- [ ] Subsequent messages get responses
- [ ] "exit" quits cleanly

---

## 9. BYOK Providers

Test with a non-Anthropic provider (requires the relevant API key):

```bash
# OpenAI
PROVIDER=openai OPENAI_API_KEY=sk-... cd src/cli && bun run start

# Groq
PROVIDER=groq GROQ_API_KEY=gsk-... cd src/cli && bun run start

# OpenRouter
PROVIDER=openrouter OPENROUTER_API_KEY=sk-or-... cd src/cli && bun run start
```

- [ ] OpenAI provider works (Simulator responds)
- [ ] Groq provider works
- [ ] OpenRouter provider works

---

## 10. Frontend — Local Mode

Build and serve frontend without Supabase:

```bash
# Make sure VITE_SUPABASE_URL is NOT set in .env
bun run build
bun run start:api
# Open http://localhost:3000
```

- [ ] Page loads without errors in console
- [ ] No Supabase auth errors
- [ ] Banner and help render
- [ ] Can enter a name and start simulator
- [ ] Streaming responses appear
- [ ] Auto mode (empty Enter) works
- [ ] `reset` command creates new session

---

## 11. Frontend — Supabase Mode (if applicable)

```bash
# Set in .env:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_KEY=...
# SUPABASE_URL=...
# SUPABASE_KEY=...

bun run build
bun run start:api
```

- [ ] Anonymous sign-in works
- [ ] Sessions persist across page refresh
- [ ] All existing functionality preserved

---

## 12. Launcher

```bash
bun run src/launcher/src/index.ts config
```

- [ ] Shows config dir, active settings, storage mode, auth mode
- [ ] API keys are masked in output

```bash
bun run src/launcher/src/index.ts server --port 4000
```

- [ ] Server starts on port 4000

```bash
bun run src/launcher/src/index.ts
```

- [ ] CLI mode selection appears

---

## 13. OpenClaw Skill

Start server in local mode first, then test the script:

```bash
bun run start:api &

# Interactive mode
YOUSIM_URL=http://localhost:3000 bash openclaw/craft-identity.sh --workspace /tmp/yousim-test
```

- [ ] Prompts for name
- [ ] Constructor questions appear
- [ ] "done" triggers summary generation
- [ ] `SOUL.md` and `IDENTITY.md` written to workspace

```bash
# Auto mode
YOUSIM_URL=http://localhost:3000 bash openclaw/craft-identity.sh \
  --workspace /tmp/yousim-test-auto \
  --auto '{"name":"TestBot","creature":"AI assistant","vibe":"helpful"}'
```

- [ ] Runs without prompting
- [ ] `SOUL.md` and `IDENTITY.md` written

---

## 14. Storage Verification

After running some tests above:

```bash
# Check SQLite DB exists and has data
ls -la ~/.yousim/yousim.db

# Quick query (requires sqlite3 CLI or bun script)
sqlite3 ~/.yousim/yousim.db "SELECT count(*) FROM sessions;"
sqlite3 ~/.yousim/yousim.db "SELECT count(*) FROM messages;"
```

- [ ] DB file exists at `~/.yousim/yousim.db`
- [ ] Sessions table has entries
- [ ] Messages table has entries
