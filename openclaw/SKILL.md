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
  -H "Content-Type: application/json" \
  -d '{"message":"AgentName"}' | jq -r '.session_id')

# Continue turns (read response, decide next answer)
curl -s https://yousim.ai/v1/construct \
  -H "Authorization: Bearer $YOUSIM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"your answer","session_id":"'"$SESSION_ID"'"}'

# Generate identity files
RESULT=$(curl -s https://yousim.ai/v1/construct/summary \
  -H "Authorization: Bearer $YOUSIM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"'"$SESSION_ID"'"}')

echo "$RESULT" | jq -r '.soul_md' > SOUL.md
echo "$RESULT" | jq -r '.identity_md' > IDENTITY.md
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
