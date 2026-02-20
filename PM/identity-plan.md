# Sprint Plan: YouSim Identity API + Honcho Plugin + OpenClaw Skill
**Target: ~2-3 hours**

---

## The Design: YouSim as a Stateful Identity API

### Why Stateful API (not Responses spec)

The Responses API (`/v1/responses`) solves real problems — server-side state via `previous_response_id`, Items-based output — but it's designed for agentic workflows with tool calls, code execution, and multi-modal I/O. YouSim's constructor is a text-in/text-out conversation. Building a full Responses-spec server is over-engineering.

Instead: **a simple stateful API with `session_id`**. Same curl ergonomics as `previous_response_id` (each call references the session, server holds history), but 10% of the implementation. If you want Responses-spec compatibility later, it wraps trivially — a simple text conversation maps onto Items with no loss.

### The API Surface

Three endpoints. That's it.

```
POST /v1/construct          — Send a message in the constructor conversation
POST /v1/construct/summary  — Generate the identity summary from the conversation
GET  /v1/construct/:id      — Get current session state (optional, for debugging)
```

#### `POST /v1/construct`

Start or continue a constructor conversation.

```bash
# Turn 1: Start with a name (no session_id = new session)
curl -s https://yousim.ai/v1/construct \
  -H "Authorization: Bearer $YOUSIM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Nova"}'

# Response:
{
  "session_id": "ys_abc123",
  "response": "Nova — nice! What kind of entity is Nova?\n\n1) AI assistant\n2) Digital familiar / companion spirit\n3) Autonomous agent\n4) Something weirder — describe it",
  "turn": 1,
  "done": false
}
```

```bash
# Turn 2+: Continue with session_id
curl -s https://yousim.ai/v1/construct \
  -H "Authorization: Bearer $YOUSIM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "3", "session_id": "ys_abc123"}'

# Response:
{
  "session_id": "ys_abc123",
  "response": "Autonomous agent, interesting...",
  "turn": 2,
  "done": false
}
```

The server holds the conversation history keyed by `session_id`. The constructor prompt (YouSim's existing `Constructor` class prompt) drives the conversation — one question at a time, numbered choices, yes/no options.

The constructor should signal `"done": true` when it has enough info (after ~5-8 turns), but the caller can also request the summary at any point.

#### `POST /v1/construct/summary`

Generate the identity documents from the conversation so far.

```bash
curl -s https://yousim.ai/v1/construct/summary \
  -H "Authorization: Bearer $YOUSIM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "ys_abc123"}'

# Response:
{
  "session_id": "ys_abc123",
  "summary": "Nova is an autonomous agent with a sharp, direct communication style...",
  "identity_md": "# IDENTITY.md - Who Am I?\n\n* **Name:** Nova\n* **Creature:** Autonomous agent...",
  "soul_md": "# SOUL.md - Who You Are\n\n## Core Identity\n\nNova is an autonomous agent..."
}
```

This runs YouSim's existing `Summary` class against the conversation history, then formats the output into ready-to-write `IDENTITY.md` and `SOUL.md` content. The caller doesn't need to parse or transform anything — just write the files.

#### Authentication

Simple API key. No Supabase, no JWT dance. For the OpenClaw integration, the key goes in `~/.openclaw/.env`:

```bash
echo "YOUSIM_API_KEY=ys_your_key_here" >> ~/.openclaw/.env
```

---

## Two Callers, Same API

The critical design requirement: **both the human and the agent can execute this**. The human runs it from a terminal. The agent runs it via `exec`. A future orchestrator agent uses it to stamp identity onto new permanent agents. Same API, same script, different callers.

### Caller 1: Human in Terminal (Interactive)

The human runs the bash script directly. It prompts for input at each turn:

```bash
$ bash ~/.openclaw/skills/yousim-identity/craft-identity.sh

🧬 YouSim Identity Crafter
📁 Target workspace: /Users/you/.openclaw/workspace

What should your agent be called?
> Nova

Nova — nice! What kind of entity is Nova?
1) AI assistant  2) Digital familiar  3) Autonomous agent  4) Something weirder
> 3

Autonomous agent, interesting. How should Nova come across?
1) Warm & casual  2) Sharp & direct  3) Snarky but helpful  4) Professional
> 2

...

🔮 Generating identity...
✅ Wrote IDENTITY.md
✅ Wrote SOUL.md

💡 Version control your identity:
   cd ~/.openclaw/workspace && git add SOUL.md IDENTITY.md && git commit -m "Identity: Nova"
```

### Caller 2: Agent via Exec (Automated)

The agent reads the skill instructions, then runs the script in **non-interactive mode** by piping answers or passing a JSON config:

```bash
# Agent calls exec with pre-determined answers
exec: bash ~/.openclaw/skills/yousim-identity/craft-identity.sh \
  --auto '{"name":"Researcher","creature":"autonomous agent","vibe":"thorough and methodical","emoji":"🔬"}'
```

Or the agent can drive the conversation turn-by-turn using curl directly:

```bash
# Agent makes curl calls itself via exec
SESSION=$(curl -s https://yousim.ai/v1/construct \
  -H "Authorization: Bearer $YOUSIM_KEY" \
  -d '{"message":"Researcher"}' | jq -r '.session_id')

curl -s https://yousim.ai/v1/construct \
  -d '{"message":"3","session_id":"'$SESSION'"}'
# ...agent reads response, decides next answer...

# When done:
RESULT=$(curl -s https://yousim.ai/v1/construct/summary \
  -d '{"session_id":"'$SESSION'"}')

# Write files
echo "$RESULT" | jq -r '.soul_md' > ~/.openclaw/workspace-researcher/SOUL.md
echo "$RESULT" | jq -r '.identity_md' > ~/.openclaw/workspace-researcher/IDENTITY.md
```

### Caller 3: Orchestrator Creating Sub-Agents

This is the powerful case. The main agent wants to create a new permanent agent (not an ephemeral sub-agent — a real entry in `agents.list[]` with its own workspace). It:

1. Creates the workspace directory
2. Calls the YouSim API to craft an identity (either interactive with the user or automated with parameters)
3. Writes the workspace files from the API response
4. Updates `openclaw.json` to add the new agent
5. Restarts the gateway

The skill instructions cover both paths so the agent knows how to handle each case.

---

## The Bash Script: `craft-identity.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# YouSim Identity Crafter for OpenClaw
# Usage:
#   Interactive:  bash craft-identity.sh [--workspace /path]
#   Automated:    bash craft-identity.sh --auto '{"name":"X","creature":"Y",...}'
#   Agent curls:  (agent uses the API directly via exec + curl)
# ============================================================================

YOUSIM_URL="${YOUSIM_URL:-https://yousim.ai}"
YOUSIM_KEY="${YOUSIM_KEY:-$YOUSIM_API_KEY}"
WORKSPACE="${WORKSPACE_ROOT:-${HOME}/.openclaw/workspace}"

# Parse args
AUTO_MODE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace) WORKSPACE="$2"; shift 2;;
    --auto) AUTO_MODE="$2"; shift 2;;
    *) shift;;
  esac
done

api() {
  local endpoint="$1"; shift
  curl -sf "${YOUSIM_URL}/v1/construct${endpoint}" \
    -H "Authorization: Bearer ${YOUSIM_KEY}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Auto mode: skip conversation, go straight to summary ──
if [[ -n "$AUTO_MODE" ]]; then
  echo "🤖 Auto mode: crafting identity from parameters..."
  
  # Extract name for the first message
  NAME=$(echo "$AUTO_MODE" | jq -r '.name // "Agent"')
  
  # Start session
  RESP=$(api "" -d "{\"message\": \"$NAME\"}")
  SESSION_ID=$(echo "$RESP" | jq -r '.session_id')
  
  # Feed remaining params as a single descriptive message
  DESCRIPTION=$(echo "$AUTO_MODE" | jq -r '
    "I want this agent to be a \(.creature // "AI assistant") with a \(.vibe // "helpful") personality. " +
    "Emoji: \(.emoji // "🤖"). " +
    (if .traits then "Key traits: \(.traits | join(", ")). " else "" end) +
    (if .backstory then "Backstory: \(.backstory)" else "" end)
  ')
  api "" -d "{\"message\": \"$DESCRIPTION\", \"session_id\": \"$SESSION_ID\"}" > /dev/null
  
  # Signal done and get summary
  SUMMARY=$(api "/summary" -d "{\"session_id\": \"$SESSION_ID\"}")
  
  echo "$SUMMARY" | jq -r '.soul_md' > "${WORKSPACE}/SOUL.md"
  echo "$SUMMARY" | jq -r '.identity_md' > "${WORKSPACE}/IDENTITY.md"
  
  echo "✅ Wrote ${WORKSPACE}/SOUL.md"
  echo "✅ Wrote ${WORKSPACE}/IDENTITY.md"
  exit 0
fi

# ── Interactive mode ──
echo "🧬 YouSim Identity Crafter"
echo "📁 Target workspace: ${WORKSPACE}"
echo ""

read -p "What should your agent be called? > " NAME
[[ -z "$NAME" ]] && NAME="Claw"

# Start session
RESP=$(api "" -d "{\"message\": \"$NAME\"}")
SESSION_ID=$(echo "$RESP" | jq -r '.session_id')
RESPONSE=$(echo "$RESP" | jq -r '.response')
DONE=$(echo "$RESP" | jq -r '.done')

echo ""
echo "$RESPONSE"

# Conversation loop
while [[ "$DONE" != "true" ]]; do
  echo ""
  read -p "> " USER_INPUT
  [[ -z "$USER_INPUT" ]] && continue
  
  # Allow early exit
  if [[ "$USER_INPUT" =~ ^(done|finish|that\'s\ it)$ ]]; then
    break
  fi
  
  RESP=$(api "" -d "{\"message\": \"$USER_INPUT\", \"session_id\": \"$SESSION_ID\"}")
  RESPONSE=$(echo "$RESP" | jq -r '.response')
  DONE=$(echo "$RESP" | jq -r '.done')
  
  echo ""
  echo "$RESPONSE"
done

# Generate summary
echo ""
echo "🔮 Generating identity..."
SUMMARY=$(api "/summary" -d "{\"session_id\": \"$SESSION_ID\"}")

echo "$SUMMARY" | jq -r '.soul_md' > "${WORKSPACE}/SOUL.md"
echo "$SUMMARY" | jq -r '.identity_md' > "${WORKSPACE}/IDENTITY.md"

echo "✅ Wrote ${WORKSPACE}/SOUL.md"
echo "✅ Wrote ${WORKSPACE}/IDENTITY.md"
echo ""
echo "💡 Version control your identity:"
echo "   cd ${WORKSPACE} && git add SOUL.md IDENTITY.md && git commit -m 'Identity: ${NAME} (via YouSim)'"
```

---

## The OpenClaw Skill

```
~/.openclaw/skills/yousim-identity/
  SKILL.md
  craft-identity.sh
```

### `SKILL.md`

```markdown
---
name: yousim-identity
description: Craft a unique agent identity using YouSim — interactive or automated
metadata: {"openclaw": {"requires": {"env": ["YOUSIM_API_KEY"], "bins": ["curl", "jq"]}, "emoji": "🧬"}}
---

# YouSim Identity Crafter

Creates a rich, unique identity for an OpenClaw agent by running a guided 
conversation through YouSim's constructor API. Writes SOUL.md and IDENTITY.md.

## Two Modes

### Interactive (human drives the conversation)
Run when the user wants to craft or redesign their agent's personality:

```bash
bash {baseDir}/craft-identity.sh
```

For a specific agent workspace:
```bash
bash {baseDir}/craft-identity.sh --workspace ~/.openclaw/workspace-ops
```

The script prompts the user with questions and numbered choices.
Takes about 5 minutes.

### Automated (agent drives with parameters)
Use when programmatically creating a new permanent agent:

```bash
bash {baseDir}/craft-identity.sh --auto '{
  "name": "Researcher",
  "creature": "autonomous agent",
  "vibe": "thorough and methodical",
  "emoji": "🔬",
  "traits": ["curious", "precise", "patient"],
  "backstory": "Specialist in deep research and analysis"
}'
```

### Direct API (agent uses curl for full control)
For maximum flexibility, call the YouSim API directly:

```bash
# Start conversation
SESSION_ID=$(curl -s https://yousim.ai/v1/construct \
  -H "Authorization: Bearer $YOUSIM_API_KEY" \
  -d '{"message":"AgentName"}' | jq -r '.session_id')

# Continue turns (read response, decide next answer)
curl -s https://yousim.ai/v1/construct \
  -d '{"message":"your answer","session_id":"'$SESSION_ID'"}'

# Generate identity files
curl -s https://yousim.ai/v1/construct/summary \
  -d '{"session_id":"'$SESSION_ID'"}' | jq -r '.soul_md' > SOUL.md
```

## Creating a New Permanent Agent

When creating a new agent for the multi-agent setup:

1. Create the workspace:
   ```bash
   mkdir -p ~/.openclaw/workspace-<name>
   ```

2. Craft identity (interactive or auto):
   ```bash
   bash {baseDir}/craft-identity.sh --workspace ~/.openclaw/workspace-<name>
   ```

3. Update config (add to agents.list in openclaw.json):
   ```json
   {"id": "<name>", "workspace": "~/.openclaw/workspace-<name>",
    "identity": {"name": "...", "emoji": "..."}}
   ```

4. Restart gateway:
   ```bash
   openclaw gateway restart
   ```

## After Running

- Suggest git-tracking: `cd <workspace> && git add -A && git commit -m "Initial identity"`
- Honcho will evolve SOUL.md over time from this starting point
- IDENTITY.md stays static (Honcho won't touch it)
- Re-run anytime to redesign: `/yousim-identity`
```

---

## Part 1: YouSim API Updates (~45 min)

### What to Build on the YouSim Side

You already have `Constructor`, `Summary`, and the FastAPI app in `api/app.py`. The new endpoints are thin wrappers:

**`POST /v1/construct`**
- If no `session_id`: create a new Honcho session, initialize `Constructor`, send first message
- If `session_id`: load history from Honcho session, append user message, get constructor response
- Return `{session_id, response, turn, done}`
- The `done` flag can be heuristic (constructor says something like "I think I have enough") or after N turns

**`POST /v1/construct/summary`**
- Load conversation history from `session_id`
- Run `Summary` class against it
- Format output into `identity_md` and `soul_md` strings (ready to write to disk)
- Return `{session_id, summary, identity_md, soul_md}`

**Auth**: Simple API key header. No Supabase JWT needed for this endpoint — it's a service-to-service call. Issue keys via a simple table or even env-var-based for v1.

**State**: You're already using Honcho for session storage in the webshell. Same pattern — store the constructor conversation in a Honcho session, retrieve it by session_id.

### Implementation Sketch (in `api/app.py`)

```python
@app.post("/v1/construct")
async def construct_v1(req: ConstructRequest):
    """Stateful constructor conversation."""
    if req.session_id:
        # Load existing session history from Honcho
        session = get_or_create_session(req.session_id)
        history = load_history(session)
    else:
        # New session
        session = create_session()
        history = []
    
    # Append user message
    history.append({"role": "user", "content": req.message})
    
    # Get constructor response
    constructor = Constructor(history=history)
    response_text = ""
    for chunk in constructor.stream():
        response_text += chunk
    
    history.append({"role": "assistant", "content": response_text})
    
    # Persist to Honcho
    save_history(session, history)
    
    return {
        "session_id": session.id,
        "response": response_text,
        "turn": len(history) // 2,
        "done": detect_done(response_text, len(history)),
    }


@app.post("/v1/construct/summary")
async def construct_summary_v1(req: SummaryRequest):
    """Generate identity documents from constructor conversation."""
    session = get_session(req.session_id)
    history = load_history(session)
    
    # Generate summary
    summary = Summary(history=history)
    summary_text = ""
    for chunk in summary.stream():
        summary_text += chunk
    
    # Format into workspace files
    name = extract_name(history)
    identity_md = format_identity_md(name, history, summary_text)
    soul_md = format_soul_md(summary_text)
    
    return {
        "session_id": req.session_id,
        "summary": summary_text,
        "identity_md": identity_md,
        "soul_md": soul_md,
    }
```

---

## Part 2: Honcho Plugin Fixes (~45 min)

Same as before — do these first so the foundation is solid.

### Bug 1: Per-Agent Peer IDs (~15 min)
`index.ts`: Replace `const OPENCLAW_ID = "openclaw"` with a function that derives from `ctx.agentId`. Update `ensureInitialized`, `before_agent_start`, `agent_end`.

### Bug 2: Don't Nuke Workspace Files (~5 min)
`install.js`: Change `updateWorkspaceDocs()` to skip existing files.

### Bug 3: SOUL.md Evolution (~15 min)
`index.ts`: Add `maybeSyncSoul` — after every ~20 messages, ask Honcho for the agent's self-representation and append/update a `## Evolved Identity` section.

### Build + Test (~10 min)
```bash
pnpm build && openclaw gateway restart
```

---

## Part 3: Skill + Script (~30 min)

1. Create skill directory: `mkdir -p ~/.openclaw/skills/yousim-identity`
2. Write `SKILL.md` (from template above)
3. Write `craft-identity.sh` (from template above)
4. Add `YOUSIM_API_KEY` to `~/.openclaw/.env`
5. Test interactive mode: `bash craft-identity.sh`
6. Test auto mode: `bash craft-identity.sh --auto '{"name":"Test","creature":"robot","vibe":"chill"}'`

---

## Execution Order

```
Hour 1: Foundations
├── [5 min]  Honcho Bug 2: install.js write-if-missing
├── [15 min] Honcho Bug 1: per-agent peer IDs
├── [15 min] Honcho Bug 3: maybeSyncSoul
├── [10 min] Build + test Honcho plugin

Hour 2: YouSim API
├── [10 min] Add /v1/construct endpoint to api/app.py
├── [10 min] Add /v1/construct/summary endpoint
├── [10 min] Add simple API key auth (no Supabase)
├── [10 min] Format summary output into identity_md + soul_md
├── [5 min]  Test with curl

Hour 3: Skill + Integration
├── [10 min] Write craft-identity.sh (interactive + auto modes)
├── [5 min]  Write SKILL.md
├── [10 min] Test: human interactive flow end-to-end
├── [5 min]  Test: auto mode with JSON params
├── [5 min]  Set up cron self-reflection job
├── [5 min]  Git commit, optionally publish to ClawHub
```

---

## Full Checklist

```
YOUSIM API
[ ] POST /v1/construct — stateful constructor conversation
    [ ] New session (no session_id) → create session, return first question
    [ ] Continue session (session_id) → append message, return next question
    [ ] Server holds history (Honcho sessions or in-memory dict)
    [ ] Returns {session_id, response, turn, done}
[ ] POST /v1/construct/summary — generate identity documents
    [ ] Load conversation from session_id
    [ ] Run Summary class
    [ ] Format into identity_md and soul_md (ready to write)
    [ ] Returns {session_id, summary, identity_md, soul_md}
[ ] Simple API key auth (header-based, no Supabase)
[ ] Test with curl: full conversation → summary → verify output

HONCHO PLUGIN
[ ] Bug 2: install.js — write-if-missing for workspace docs
[ ] Bug 1: index.ts — per-agent peer IDs
[ ] Bug 3: index.ts — maybeSyncSoul (section-based SOUL.md update)
[ ] pnpm build && openclaw gateway restart

OPENCLAW SKILL
[ ] craft-identity.sh
    [ ] Interactive mode (read from terminal, loop conversation)
    [ ] Auto mode (--auto JSON, skip conversation)
    [ ] Both write SOUL.md + IDENTITY.md to target workspace
    [ ] Suggest git commit after writing
[ ] SKILL.md with instructions for all three call patterns:
    [ ] Interactive (human runs script)
    [ ] Automated (agent runs with --auto)
    [ ] Direct API (agent uses curl for full control)
[ ] Test: human runs interactive flow
[ ] Test: agent uses auto mode via exec
[ ] Test: creating a new permanent agent workspace

CRON (OPTIONAL)
[ ] Weekly self-reflection cron job
[ ] Triggers honcho_analyze → SOUL.md update

FUTURE
[ ] Publish skill to ClawHub
[ ] Responses-spec wrapper (if ecosystem demand)
[ ] BOOTSTRAP.md that invokes the skill on first boot
[ ] Agent-to-agent identity crafting (orchestrator creates team)
```
