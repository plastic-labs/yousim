# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)**. It is the single agent-facing source of truth
for this repository: architecture, invariants, and gotchas.

This file exists only because Claude Code looks for it by name, and holds no
content of its own — anything worth knowing belongs in `AGENTS.md`, where every
agent will find it.

## Claude Code specifics

- `bun run test` and `bunx tsc --noEmit` are the two checks to run before
  declaring work done. Neither needs a model credential.
- Tests that touch credentials must run with `YOUSIM_KEYCHAIN=0`. The macOS
  Keychain is machine-global and a test run without this has already overwritten
  a real connected key.
- Do not run `yousim connect` or any command that makes a live model call as a
  verification step. Both spend the user's credential, and `connect` opens a
  browser and waits five minutes for a redirect.
