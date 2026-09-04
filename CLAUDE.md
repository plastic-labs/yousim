# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)**. It is the single agent-facing source of truth
for this repository: architecture, invariants, and gotchas.

This file exists only because Claude Code looks for it by name, and holds no
content of its own — anything worth knowing belongs in `AGENTS.md`, where every
agent will find it.

## Claude Code specifics

- `bun run test` and `bunx tsc --noEmit` are the two checks to run before
  declaring work done. Neither needs a model credential. `bun run test:ci` is
  the full gate and additionally builds and packs the published artifact.
- **Run `bun run test`, never `bun test` directly.** The former is
  `scripts/hermetic.ts`, which sets a throwaway `HOME`/`YOUSIM_HOME` and
  `YOUSIM_KEYCHAIN=0` in the environment *before Bun starts*, and strips every
  provider credential from the child. `bun test` on its own has already
  overwritten a real key in the login keychain, and `yousim config` moves
  `~/.yousim/credentials.json` when `YOUSIM_HOME` points elsewhere, so a
  partially-isolated run can relocate the real credential.
- Do not run `yousim connect` or any command that makes a live model call as a
  verification step. Both spend the user's credential, and `connect` opens a
  browser and waits five minutes for a redirect.
