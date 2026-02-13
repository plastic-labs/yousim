# @yousim/cli Module Documentation

## Overview

The `@yousim/cli` module provides a command-line interface for interacting with the YouSim simulation. It offers a terminal-based experience with color-coded output and interactive conversation flow.

## Key Features

### Interactive Conversation Loop

The CLI implements a continuous conversation loop that:

1. Presents initial prompts from both SEARCHER CLAUDE and SIMULATOR CLAUDE
2. Requests a name for the initial identity location
3. Processes user commands in real-time
4. Streams responses from the simulation engine

### Color-Coded Output

Different roles in the conversation are color-coded for better readability:

- SEARCHER CLAUDE: Blue text
- SIMULATOR CLAUDE: Yellow text

### Input Handling

Uses Node.js readline interface for interactive input processing.

## Usage

Due to limitations with Bun's workspace filter commands and interactive stdin, this package must be run directly from its directory:

```bash
cd src/cli
bun run start
```

Or for development:

```bash
cd src/cli
bun run dev
```

## Commands

The CLI supports the same commands as the web interface:

- `/locate [name]` - Pinpoint an identity in the latent space
- `/summon` - Conjure entities and environments from identities
- `/speak` - Channel communication from an identity
- `/steer` - Alter properties or traits of the simulated identity
- `/request` - Solicit artifacts, objects, code, art from the identity
- `[create]` - Invent your own command to interact with the latent space

Type `exit` at any prompt to quit the application.

## Dependencies

- `@yousim/core` - Core simulation logic (workspace dependency)
- `readline` - For interactive terminal input
