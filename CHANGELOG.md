# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims at [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the `0.x` caveats spelled out in [Versioning](#versioning) below.

Read [Versioning](#versioning) before you take a version number to mean
anything. There are two of them in this repository and they move
independently, on purpose.

## [Unreleased]

Nothing yet.

## [0.1.0] — unreleased

First release of the `yousim` package. Nothing has been published to npm under
this name yet, so there is no upgrade path to describe and no older layout to
migrate from; everything below is "how it arrives", not "what changed".

Package version `0.1.0`. Contract version `0.1.0`.

### Added

- `yousim` as a single published binary: `yousim` (interactive CLI),
  `yousim server` (local API plus the web UI on the same origin),
  `yousim connect`, `yousim config`, `yousim --version`.
- **BYOK via OpenRouter OAuth (PKCE).** `yousim connect` obtains a key that is
  yours; the tool stores it and never holds one on your behalf.
- **Credential storage** in the macOS Keychain, falling back to a `0600` file
  at `<configHome>/credentials.json` — deliberately not `config.json`, which
  gets pasted into issues and committed to dotfile repos.
- **One config resolver** with documented precedence: flags > shell env >
  `./.yousim.json` (provider and model only) > `<home>/config.json` >
  `<home>/.env` > defaults. `yousim config` prints the resolved values and
  where each came from.
- **Local persistence** of CLI conversations under `<dataHome>`, so a restart
  does not lose a session. SQLite for the CLI, in-memory for anything that
  wants no disk.
- **`@yousim/core` contract surface** (`src/core/src/contract.ts`), exporting
  `CONTRACT_VERSION` — a platform-free entrypoint importable from a browser or
  an edge runtime.
- **`/v1/construct`** on the local API, and the skill that wraps it.

### Changed

- The tool is local-only. Auth and the hosted storage backend were removed:
  every request is the local owner, and there is no server-side user concept.
- `src/frontend` became `src/web`.
- Model credentials are resolved per call rather than at module load, so one
  process can serve a browser holding its own key, a CLI reading env, and a
  server handling a different caller on every request.

### Fixed

- **The current directory can no longer execute code or redirect inference.**
  A `bunfig.toml` in the directory you launch from could `preload` arbitrary
  code before the first line of `yousim` ran, and a `./.env` could point
  `OPENAI_BASE_URL` at an attacker's endpoint with your credential attached.
  Both are closed, and the published command is tested by launching it out of
  a directory built to be hostile.
- **`yousim config` no longer moves anything.** Config resolution used to
  perform a filesystem migration on every launch, so a command whose entire
  job is to print where values came from could relocate a live credential out
  of `~/.yousim`. The migration is gone and a test keeps it gone.
- **No cross-provider key fallback.** `OPENROUTER_API_KEY` no longer falls
  back to `OPENAI_API_KEY`, which is commonly a placeholder for a local
  OpenAI-compatible server and produced a 401 that read as a broken connect
  flow.
- **A missing credential throws**, naming `yousim connect`, instead of being
  papered over with a placeholder key and surfacing as a confusing 401 much
  later.
- **A retired default model id.** The OpenRouter default was
  `anthropic/claude-3.5-sonnet`, which began 404ing when Claude 3.x was
  dropped — a wrong default makes the tool look broken rather than
  misconfigured.
- **Storage ownership guard**: writing a message into a session belonging to
  another `userId` now fails instead of silently orphaning the data.
- Unknown CLI flags are rejected rather than ignored.
- The local server binds `127.0.0.1` rather than Bun's wildcard default, and
  CORS is scoped to local origins instead of reflecting any `Origin` back with
  `Allow-Credentials`.

### Security

The items under **Fixed** marked as directory-, credential- or bind-related
are security fixes; see [SECURITY.md](SECURITY.md) for what is in scope. The
code has had one external audit, whose findings are addressed in this release.

## Versioning

### Two versions, moving independently

There are two numbers, and neither is derived from the other:

| number             | lives in                       | describes                                     |
| ------------------ | ------------------------------ | --------------------------------------------- |
| package version    | `src/launcher/package.json`    | the published `yousim` binary and its CLI     |
| `CONTRACT_VERSION` | `src/core/src/contract.ts`     | the stable surface `@yousim/core` exports      |

They are allowed to diverge, and they will. A CLI flag, a prompt, a storage
detail or a bug fix moves the package version and leaves the contract
untouched. Equally, the contract can gain an export in a release whose
user-visible behaviour is identical. **Do not read a package version bump as a
contract change, or a quiet package release as proof the contract held.** The
entries in this file are the only place that answers that question — which is
why every release section states both numbers explicitly, even when only one
of them moved.

`CONTRACT_VERSION` follows semver on its own terms:

- **patch** — no surface change; behaviour of an existing export fixed.
- **minor** — an export added. Existing exports keep their signatures and
  their meaning.
- **major** — an export removed, renamed, or changed in signature or meaning,
  including a type narrowing that was previously accepted. Also: the contract
  gaining a requirement on its host — anything that makes it stop being
  importable from a browser or an edge runtime is a breaking change to the
  contract even if no export moved.

### If you consume the contract by pinned git submodule

Not every consumer installs `@yousim/core` from npm. Only `yousim` is
published; `@yousim/core` is `private` in this workspace and is inlined into
the launcher's bundle rather than uploaded. A consumer that needs the contract
therefore vendors this repository at a pinned commit — a git submodule — and
imports `src/core/src/contract.ts` from it.

Advancing that pin is not covered by a package version, because no package
version is involved: you are moving from one commit to another. So this file
carries what you need to decide instead. For every release section:

- Both numbers are stated at the top. **If `CONTRACT_VERSION` is unchanged
  from your current pin, the surface you compile against is unchanged** and
  advancing the pin is a behaviour question, not a compatibility one — read
  **Fixed** and **Changed** for anything you rely on.
- A `CONTRACT_VERSION` change always gets its own entry under a **Contract**
  heading, naming the exports added, removed, or changed, and — for a major —
  what the migration is. If a release has no **Contract** heading, the
  contract did not move.
- Changes below the contract that a submodule consumer can still feel — the
  platform-free constraint, the shape of `ModelConfig`, whether a credential
  is required at call time — belong under **Contract** as well, even when no
  export name changes. A submodule consumer compiles our source, so our
  internal file layout is closer to their problem than it is to an npm
  consumer's.

Two invariants make that promise keepable, and both are enforced by tests
rather than by review: `contract.ts` never transitively imports a
platform-only module, and no provider client is constructed at module load.
[AGENTS.md](AGENTS.md) explains both. A change that breaks either is a
breaking change for you even if the export list is untouched.

### Pre-1.0

While the package is `0.x`, a minor bump may carry a breaking CLI or config
change. Anything breaking is called out in its release section. Only the
latest release is supported; see [SECURITY.md](SECURITY.md).

[Unreleased]: https://github.com/plastic-labs/yousim/compare/main...HEAD
[0.1.0]: https://github.com/plastic-labs/yousim/tree/main
