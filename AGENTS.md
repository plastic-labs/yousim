# AGENTS.md

Orientation for coding agents working in this repository. It covers how the
code is arranged, the invariants that are easy to break by accident, and the
gotchas that have already cost someone a debugging session.

For what the tool is and how a person uses it, read [README.md](README.md) —
this file does not repeat it.

## What this package is, architecturally

A Bun workspaces monorepo producing one binary, `yousim`. It is a local,
single-user tool: it runs on the user's machine, against their own data and
their own model credential.

There is no auth, no accounts, and no server-side user concept. Every request
is the local owner (`"local"`, hardcoded). **Do not add an auth layer or a
hosted storage backend here.** If a change seems to need one, it belongs in a
downstream consumer of `@yousim/core`, not in this package. An auth module and
a Supabase backend were both removed from this tree deliberately; re-adding
them is a regression, not a feature.

Two things in `src/api` are what make "local" true in the absence of auth, and
neither is redundant:

- **The server binds `127.0.0.1`**, not Bun's default wildcard. `HOST` overrides
  it, which is how the container gets `0.0.0.0` from the Dockerfile.
- **CORS is scoped to local origins.** `cors()` with no options reflects any
  Origin back with Allow-Credentials, which would let any page the user has open
  read their sessions and spend their model credit.

`HOST` is in `CWD_ENV_KEYS` for the same reason `OPENAI_BASE_URL` is: a cloned
repo's `./.env` must not be able to widen the bind.

## Layout

| path            | package            | role                                                                 |
| --------------- | ------------------ | -------------------------------------------------------------------- |
| `src/core`      | `@yousim/core`     | Agents, model access, config resolution, credentials, storage        |
| `src/cli`       | `@yousim/cli`      | Terminal interface and the OAuth connect flow                        |
| `src/api`       | `@yousim/api`      | Elysia server for local use, plus `/v1/construct`                    |
| `src/web`       | `@yousim/web`      | React/Vite web UI, served by the API from the same origin            |
| `src/launcher`  | `yousim`           | The published binary: subcommand dispatch and config resolution      |
| `openclaw/`     | —                  | Skill wrapping `/v1/construct`                                       |
| `legacy-python/`| —                  | Original Python implementation. Archived, not maintained             |

`src/cli` and `src/api` both depend on `@yousim/core` via `workspace:*`, so
core changes are live immediately for both.

Everything in `legacy-python/` is historical. Do not treat it as
a description of current behavior.

## The two invariants

These are the ones most likely to be broken by an innocuous-looking change.

### 1. `contract.ts` must stay platform-free

`src/core/src/contract.ts` is the stable surface downstream consumers depend
on. It has to be importable from a browser and from an edge runtime, neither of
which has a filesystem.

**It must never transitively import a platform-only module** — `bun:sqlite`,
`fs`, `os`, `path`, or their `node:` forms. Not directly, and not through
anything it imports, at any depth.

`src/core/src/__tests__/contract.test.ts` bundles `contract.ts` for the browser
with a resolver plugin that traps every banned specifier, and fails naming the
file that imported it. Asking the bundler rather than scanning the source is
deliberate: the resolver sees every import form (`import()`, `export ... from`,
single quotes, aliases, subpaths), and a hand-rolled walk that fails to resolve
anything reports success. Note that `target: "browser"` on its own does NOT
fail on a Node builtin — it silently substitutes a shim, so the build succeeds
and the string vanishes from the output. The trap is what makes the test real.
Keep it passing.

This constraint is why `simulate()` lives in `simulate.ts` and is re-exported
from `contract.ts` directly, rather than being reached through the `index.ts`
barrel. The barrel exports the stores, the stores import `bun:sqlite` and `fs`,
and the contract used to reach them that way. **`contract.ts` must not import
from `index.ts`.**

Adding an export to `contract.ts` is a commitment to keep it stable. Keep the
file small.

### 2. No provider client at module load, ever

`ModelConfig` (`src/core/src/model.ts`) carries `provider` / `model` / `apiKey`
/ `baseURL` / `maxOutputTokens` **per call**.

**Never construct a provider client at module load from `process.env`.** The
same code has to serve three callers: a browser holding the user's own BYOK key
(no `process.env` at all), a CLI reading env, and a server handling a different
caller on every request. A module-level client bakes in one credential and
breaks the other two.

Env is consulted only for fields the caller left unset. Clients are built
per-call inside `createModelInstance()`; the AI SDK clients are cheap to create,
so there is nothing to optimize here.

Two related rules that already have regression tests behind them:

- **A missing credential throws.** Providers used to be built at load time with
  `apiKey: "placeholder"`, which turned a missing key into a confusing 401 much
  later. `createModelInstance()` now throws a message naming `yousim connect`.
- **No cross-provider key fallback.** `OPENROUTER_API_KEY` must not fall back to
  `OPENAI_API_KEY`. `OPENAI_API_KEY` is commonly a placeholder for a local
  OpenAI-compatible server; letting it satisfy OpenRouter sends a bogus token,
  shadows a connected account, and produces a 401 that reads as a broken
  connect flow.

## Core modules

### `agents.ts` — the product

Six classes, all **pure prompt builders**: they assemble a message array and
call one streaming helper. No storage, no I/O, no env reading.

| class             | role                                                       |
| ----------------- | ---------------------------------------------------------- |
| `GaslitClaude`    | The "searcher" — the Claude exploring for an identity      |
| `Simulator`       | The terminal — responds to commands as the latent space    |
| `Constructor`     | Interviews the user to build a new identity                |
| `Summary`         | Condenses a constructor conversation into an identity seed |
| `SummaryFollowUp` | Affirms an identity against its summary                    |
| `Identity`        | Multi-stage initialization, then chat                      |

Keep them pure. A hosted consumer must be able to instantiate them unchanged;
if it can't, the contract is broken. Anything that needs a disk or a database
belongs in the caller.

The prompts themselves are load-bearing product, not boilerplate. The register
of `Simulator.getSystemPrompt()` — lowercase, "capital letters and punctuation
are optional", "hyperstition is necessary" — is what produces the output the
tool exists for. Do not "clean up" or professionalize these strings.

`Identity` is the one stateful-ish agent: `initialize()` runs several model
calls to build its own prompt before chatting, so it is slow on first turn and
must be awaited before streaming.

### `model.ts` — model access

`resolveProvider()`, `resolveModel()`, `createModelInstance()`. Defaults live in
`PROVIDER_DEFAULTS`.

Defaults matter more here than in most projects: the simulator effect depends
heavily on the model, so a wrong default makes YouSim look broken rather than
misconfigured. A retired id is a live hazard — `anthropic/claude-3.5-sonnet`
was the OpenRouter default until every Claude 3.x was dropped and it began
404ing. A test asserts the OpenRouter default has a `vendor/model` shape, since
a bare name there is either another provider's id or a retired one.

`setCredentialResolver()` is the injection seam for surfaces that have a
credential store. The CLI passes one that reads the connected OpenRouter key.
It is injected rather than imported so `model.ts` stays free of filesystem
imports — see invariant 1.

### `config.ts` — one resolver

Path rules and file parsing live here so the CLI, the server and the launcher
cannot disagree about where anything is. Precedence: flags > shell env >
`./.yousim.json` (provider and model only) > `<home>/config.json` >
`<home>/.env` > defaults.

`configHome()` and `dataHome()` both resolve `YOUSIM_HOME` > XDG > `~/.yousim`.

`neutralizeCwdEnv()` is the security-relevant one. Bun auto-loads `./.env`
before `main()` runs, so opting out has to be active: it reads the file and
deletes any `CWD_ENV_KEYS` entry from `process.env` whose value came from it.
The threat is a cloned repo's `.env` redirecting inference via
`OPENAI_BASE_URL` with the user's credential attached.

Three things about it:

- **It must run before anything reads `process.env`.** In
  `src/launcher/src/index.ts` this is why `neutralizeCwdEnv` is the only static
  import and everything else loads through `await import`. Do not add a static
  import to that file — it would let a module read env before the cleanup.
- **It is called at every entry point**, since `yousim-cli` is its own bin and
  `src/cli/src/cli.ts` is importable directly. Running it twice is safe.
- **It touches only `CWD_ENV_KEYS`** — the variables this package reads. A
  cloned repo's `.env` is full of things that are none of our business, and
  scrubbing them could break whatever else shares the process. Adding a key
  this package reads means adding it to that list too.

`src/api` does **not** call `neutralizeCwdEnv()`. See the caveat in
[CONTRIBUTING.md](CONTRIBUTING.md).

### `credentials.ts` — the connected key

Keychain first on macOS, falling back to a `0600` file at
`<configHome>/credentials.json`. Deliberately not `config.json`: config gets
pasted into issues and committed to dotfile repos, and a credential should not
travel with it.

`YOUSIM_KEYCHAIN=0` disables the keychain. **Tests that touch credentials must
set it.** The keychain is machine-global and cannot be isolated by pointing
`YOUSIM_HOME` elsewhere; the credential tests overwrote a real connected key in
the login keychain the first time they shipped without this guard.

Writes go through `security -i`, which takes the command on stdin, so the key
never lands in argv. `-i` tokenizes what it reads and round-trips neither `"`
nor `\`, silently truncating instead of failing — so a key containing either
falls back to the argv form rather than being stored wrong.

`connectedProvider()` lives here rather than in the CLI so that `yousim config`
reports the same provider the CLI actually uses. Two copies of that rule is how
config output starts lying.

### Storage

The `Storage` interface (`src/core/src/storage.ts`) covers sessions, messages,
summaries, and users. Two implementations ship here: `MemoryStorage`
(`storage/memory.ts`, zero deps) and `SqliteStorage` (`storage/sqlite.ts`,
`bun:sqlite`). Factory: `createStorage("memory" | "sqlite")`.

The interface exists to **pin the shape, not to enable swapping**. Each surface
has exactly one implementation — the CLI has SQLite, a browser UI would have
IndexedDB, a hosted consumer has its own backend — and they never substitute
for each other at runtime. So resist generalizing it further; it is already as
abstract as it needs to be.

Every method takes a `userId` and filters on it, even though there is only ever
one owner locally. Keep that: it is what lets a downstream consumer implement
the same interface without a fork.

## Gotchas

### `streamText` does not reject on provider errors

This is the big one. AI SDK v5's `streamText` **does not throw** when the
provider returns an error. It reports through the `onError` callback and the
text stream simply ends, empty.

Consequences:

- A `try`/`catch` around `await streamText(...)` or around iteration of
  `.textStream` is **decorative**. It cannot catch a 401, a 404 from a retired
  model id, a rate limit, or a context-length error. The ones currently in
  `simulate.ts` and `src/cli/src/cli.ts` catch nothing in practice.
- The user-visible symptom is a silent empty response, which is
  indistinguishable from a model that declined to answer — and is exactly the
  failure mode most likely to be misread as "YouSim is broken".
- Nothing in this tree passes `onError` yet, so provider errors are currently
  swallowed. If you are adding real error surfacing, `onError` is the seam;
  removing a decorative `catch` without adding one makes things no worse but no
  better either.

`streamText` is also not async in v5 — it returns its result synchronously.
The `await` in front of it in `simulate.ts` is a no-op.

### Long output truncates silently

`maxOutputTokens` is optional and unset by default. Simulator output is long by
nature, so leaving it unset invites truncation. It is threaded through
`ModelConfig` per call.

### `MODEL` is global across providers

Model ids are provider-namespaced but `MODEL` is not, so a name set for one
provider leaks to every other. The CLI warns on an OpenRouter id with no `/`.
Bear this in mind when writing anything that sets `MODEL`.

### The simulator prompt is hardcoded to `anthropic`

`runSimulator()` builds its shell prompt as the literal
`simulator@anthropic:~$` regardless of the provider in use, matching the
`simulator@anthropic:~/$` in the agent prompts. It is cosmetic, and part of the
fiction rather than a config bug — but do not read it as reporting the provider.

## Tests

```bash
bun run test        # the whole suite, in a hermetic environment
bun run test:ci     # typecheck + build + pack + suite + coverage floors
bunx tsc --noEmit   # typecheck alone
```

**Do not run `bun test` directly.** `bun run test` is `scripts/hermetic.ts`,
which builds the environment the suite has to run in and then starts Bun inside
it. That ordering is the point:

- a throwaway `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `YOUSIM_HOME` and `YOUSIM_DB`, removed when the run ends
- `YOUSIM_KEYCHAIN=0` **before Bun starts**. The macOS Keychain is
  machine-global and cannot be redirected with `YOUSIM_HOME`; a run without the
  guard has already overwritten a real connected key. Setting it at the top of
  a test file is too late — every static import has already run. So
  `credentials.test.ts` now *asserts* the variable instead of assigning it, and
  refuses to run without it.
- every provider credential stripped from the child, so no test can make a
  live billed call even with keys exported. `no-live-calls.test.ts` asserts the
  stripping worked. A test that genuinely needs a real credential goes behind
  `bun run test:live`; there are none.

A throwaway `HOME` is not belt-and-braces. `resolveConfig()` in the launcher
calls `migrateLegacyHome()`, which **moves** `~/.yousim/credentials.json` and
`yousim.db` whenever `YOUSIM_HOME` or `XDG_CONFIG_HOME` points elsewhere. A run
that isolates only `YOUSIM_HOME` relocates the developer's real credential into
a temp directory that is then deleted.

`scripts/hermetic.ts` also refuses to pass quietly:

- it counts `*.test.ts` on disk and fails if Bun discovered fewer, which is the
  bug the old root `test` script had — it only ran `@yousim/core`
- it enforces per-module line-coverage floors (config, credentials, pkce,
  storage) read from lcov. Deliberately not a repo-wide number: `agents.ts` is
  380 lines of prompt text a percentage says nothing useful about.

Suites, and what each is actually for:

| file | claim |
| ---- | ----- |
| `core/__tests__/contract.test.ts` | invariant 1, via a real browser bundle |
| `core/__tests__/config.test.ts` | config precedence and the cwd-`.env` guard |
| `core/__tests__/credentials.test.ts` | key storage, 0600, keychain isolation |
| `core/__tests__/pkce.test.ts` | the OAuth exchange, including its error paths |
| `core/__tests__/storage.test.ts` | schema, path resolution, per-user scoping |
| `core/__tests__/no-live-calls.test.ts` | the suite needs no account |
| `api/__tests__/boundary.test.ts` | loopback bind, CORS, malformed bodies, no path leaks |
| `launcher/__tests__/packaged.test.ts` | what `npm pack` actually ships |
| `launcher/__tests__/hostile-dir.test.ts` | the published command, launched from a malicious cwd |

`hostile-dir.test.ts` is the one to keep honest. It builds a directory
containing `.env`, `.env.local`, `.env.production`, a `bunfig.toml` whose
`preload` writes a marker file, and a fake provider endpoint that is a live
local listener counting requests — then launches the **installed** command out
of it. The test it replaced grepped the entrypoint for its shebang flags, which
proves they are written down, not that they work. Between the two sits the
bundler, npm's bin shim, and whether the platform has `env -S` at all.

## Documentation split

Three files, deliberately answering different questions. They are not copies of
each other, and should not drift into being copies.

| file              | audience       | question it answers                          |
| ----------------- | -------------- | -------------------------------------------- |
| `README.md`       | humans         | Should I install this, and how do I run it?  |
| `AGENTS.md`       | coding agents  | How is this built, and what must I not break? |
| `CONTRIBUTING.md` | contributors   | How do I develop against a clone?            |

`CLAUDE.md` is a pointer at this file and holds no content of its own.

There was previously an `AGENT.md` byte-identical to `CLAUDE.md` — one had been
`cp`'d from the other. Both are gone in favor of this file, which follows the
[agents.md](https://agents.md) convention. If you find yourself duplicating a
doc, don't: point at the original instead.
