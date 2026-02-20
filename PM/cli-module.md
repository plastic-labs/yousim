# @yousim/cli Module Documentation

## Overview

The `@yousim/cli` module provides a terminal interface for YouSim with three interactive modes: Simulator, Constructor, and Chat.

## Modes

### 1. Simulator
The original YouSim experience. Explore identities in the latent space with two agents:
- **Searcher Claude** (blue): Generates commands to explore the identity
- **Simulator Claude** (green): Responds to commands as the simulated identity

Flow: Enter a name → `/locate {name}` → conversation loop (type commands or press Enter for auto-mode).

### 2. Constructor
Build a new identity through guided conversation:
- Enter a name for the identity
- Answer questions about the identity (the Constructor agent drives the conversation)
- Type "done" when finished
- Summary is generated automatically
- Option to transition directly into Chat mode with the constructed identity

### 3. Chat
Chat with a constructed identity:
- Accepts a summary from Constructor (if transitioning) or user-pasted text
- Multi-stage identity initialization (Identity agent)
- Ongoing chat loop

## Usage

```bash
# Run directly (required due to Bun stdin limitations)
cd src/cli
bun run start

# Mode selection appears:
#   1) Simulator  - Explore identities in the latent space
#   2) Constructor - Build a new identity through conversation
#   3) Chat       - Chat with a constructed identity
```

## Color Theme

| Role | Color | Hex |
|---|---|---|
| Prompt | Purple | `#6b6be8` |
| Searcher Claude | Blue | `#4c78ff` |
| Commands | Orange | `#c06a2a` |
| Simulator Claude | Teal | `#6fb0a0` |
| Constructor | Gold | `#d4a017` |
| Identity (Chat) | Red | `#e06c75` |
| Info | Gray | `#888888` |

## Commands

In Simulator mode:
- `/locate [name]` — Pinpoint an identity in the latent space
- `/summon` — Conjure entities and environments
- `/speak` — Channel communication from an identity
- `/steer` — Alter properties or traits
- `/request` — Solicit artifacts, code, art
- `[create]` — Invent your own command
- Empty line → auto-mode (Searcher Claude generates command)
- `exit` — Quit

In Constructor mode:
- Answer questions (numbered choices or free text)
- `done` — Finish construction and generate summary
- `exit` — Quit

In Chat mode:
- Type messages to chat with the identity
- `exit` — Quit

## Dependencies

- `@yousim/core` — Core agents, storage
- `chalk` — Terminal color output
- `readline` — Interactive terminal input
