# Contributing

This is the only document that assumes you have cloned the repository. Users
never need to — see [README.md](README.md).

For the architecture and the invariants a change must not break, read
[AGENTS.md](AGENTS.md) before touching `src/core`.

## Setup

```bash
git clone https://github.com/plastic-labs/yousim
cd yousim
bun install
```

Bun >= 1.1. There is no build step for development; everything runs from
TypeScript source.

## Checks

```bash
bun run test        # core test suite
bunx tsc --noEmit   # typecheck every package
```

Neither needs a model credential. Both should be clean before you open a pull
request.

Run the tests through `bun run test`, not `bun test` directly. That script is
`scripts/hermetic.ts`, which builds the environment the suite has to run in and
then starts Bun inside it:

- a throwaway `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `YOUSIM_HOME` and
  `YOUSIM_DB`, deleted when the run ends
- `YOUSIM_KEYCHAIN=0` **before Bun starts**. The macOS Keychain is
  machine-global and cannot be isolated by moving `YOUSIM_HOME`; a run without
  the guard has already overwritten a real connected key. Setting it at the top
  of a test file is too late — static imports have run by then.
- every provider credential stripped from the child, so no test can make a
  live billed call even if you have keys exported

`bun run test:ci` is the full gate: typecheck, then build and `npm pack`, then
the suite with per-module coverage floors. It is what CI runs.

A test that genuinely needs a live provider credential goes behind
`bun run test:live`, which leaves the environment alone. There are none today,
and `src/core/src/__tests__/no-live-calls.test.ts` keeps one from landing in
the default path by accident.

## Running from a clone

```bash
bun run src/launcher/src/index.ts            # the binary, as published
bun run src/launcher/src/index.ts sessions   # any subcommand
bun run src/launcher/src/index.ts config     # what your config resolves to

bun run start:cli                            # the CLI directly, skipping the launcher
bun run start:api                             # local API server
bun run dev                                   # API + frontend, both watching
bun run dev:api / bun run dev:frontend        # either half alone
bun run build                                 # build the frontend
```

Prefer going through the launcher when you are testing anything
config-related — it is where precedence is resolved and where `./.env` is
neutralized, so the CLI behaves differently without it.

### The `./.env` caveat, which is a real trap

The published binary deliberately does **not** read `./.env`. See the
configuration section of the README for why.

**`bun run start:api` and `bun run dev` do still read this repository's
`./.env`.** They start `src/api` directly and never route through the launcher,
and `src/api` does not call `neutralizeCwdEnv()`. Bun auto-loads `./.env`
before anything else runs, so a `.env` in the repository root is live for those
two scripts.

Practical consequences while developing:

- A stale `PROVIDER`, `MODEL` or `OPENAI_BASE_URL` in `./.env` will silently
  apply to the dev server and not to `yousim`. If the two disagree about where
  inference is going, that is why.
- `bunx yousim config` will not show you the dev server's effective
  configuration, because it reports the launcher's resolution.

`.env.template` documents the variables. Copying it to `./.env` only affects
the dev-server scripts above; for the CLI, use `yousim connect` or
`~/.yousim/config.json`.

## Conventions

- **Comments explain why, not what.** The existing comments in `src/core` carry
  the reasoning behind non-obvious decisions — which regression a guard
  prevents, why a module is injected rather than imported. Match that. A
  comment that restates the code is noise; one recording a decision is the only
  copy of that information.
- **Do not edit the agent prompts casually.** The strings in
  `src/core/src/agents.ts` are the product. Their register — lowercase,
  unpunctuated, deliberately strange — is what produces the output the tool
  exists for. Tidying them breaks it.
- **Keep `contract.ts` small.** Adding an export is a stability commitment.
- **No auth, no hosted backends.** This package is local and single-user by
  design; both were removed deliberately. See AGENTS.md.

## Documentation

Four files with distinct audiences. Keep them distinct — do not duplicate prose
between them, and never create a second copy of a doc under a different name.

| file              | audience      |
| ----------------- | ------------- |
| `README.md`       | users         |
| `AGENTS.md`       | coding agents |
| `CONTRIBUTING.md` | contributors  |
| `CLAUDE.md`       | a pointer at `AGENTS.md`, nothing more |

`legacy-python/` is historical and is not maintained. Do not update
it to match new work, and do not cite it as current behavior.

## Testing the CLI as an installed command

The published package is a bundle, so `bin` points at `dist/yousim.js` rather
than at the source. Build it once before linking:

```bash
bun run pack                      # builds the web assets and bundles the launcher
cd src/launcher && bun link
yousim config
```

`bun unlink` in the same directory removes it. Because the link now points at
the bundle rather than at source, edits are **not** live — re-run `bun run
pack` after a change. When you want live edits, go through
`bun run src/launcher/src/index.ts` instead; the only thing you lose is the
bundling, which is what the packaging tests cover.
