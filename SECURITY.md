# Security Policy

`yousim` is a local, single-user tool. It runs on your machine, against your
own data and your own model credential — there is no YouSim server, no account,
and no credential we hold on your behalf. That shape decides most of what
follows: what we consider a vulnerability, and what is the documented design.

## Reporting a vulnerability

Report privately through GitHub Security Advisories:

**https://github.com/plastic-labs/yousim/security/advisories/new**

Please do not open a public issue, pull request, or discussion for a suspected
vulnerability. A public report is a disclosure, and it is a disclosure made
before anyone has had a chance to ship a fix.

A useful report says what an attacker controls, what they get, and how you
know. Concretely, that usually means:

- the version — `yousim --version`, or the commit if you are running a clone
- your OS and `bun --version`
- the smallest reproduction you can manage: the command, the directory it ran
  in, and any file (`.env`, `bunfig.toml`, `.yousim.json`, `config.json`) whose
  contents matter
- what you expected instead

Please redact your own credentials from anything you attach. We do not need a
working key to reproduce a credential-handling bug, and a key pasted into a
report is a key you now have to rotate.

## What to expect

This is a small team, and these are business days, not calendar days:

| stage                                                      | target       |
| ---------------------------------------------------------- | ------------ |
| We acknowledge the report                                  | 3 days       |
| We tell you whether we can reproduce it, and our assessment of severity | 10 days      |
| Fix released for anything we accept as a vulnerability      | 90 days      |

If a report needs longer than that, we will say so and why rather than let the
window lapse quietly. We will credit you in the advisory and the changelog
unless you would rather we did not — just say.

We do not run a bug bounty and cannot offer payment.

## Supported versions

| version | supported |
| ------- | --------- |
| latest release | yes |
| anything older | no |

Only the most recent release is supported. While the package is `0.x` there
are no backported fixes and no maintenance branches: a security fix ships as
the next release, and upgrading is the remedy. If you are pinned to an older
version, the fix is to unpin.

The `0.x` major also means the interface can change in a patch release when
the safe behaviour requires it. Where that has happened, the
[changelog](CHANGELOG.md) says so.

## In scope

Roughly, anything that lets someone other than you influence what `yousim`
does with your credential, your data, or your machine:

- **Credential handling.** The connected key belongs in the macOS Keychain, or
  in a `0600` file at `<configHome>/credentials.json` — never in
  `config.json`, never in `argv`, never in a log line, and never in the
  published artifact.
- **The untrusted current directory.** `yousim` is expected to be safe to run
  from a directory you did not write, **however you invoke the command** —
  `yousim`, `bunx yousim`, `bun run yousim`. A `./.env`, `./.env.local`,
  `./bunfig.toml` or `./.yousim.json` there must not be able to execute code,
  redirect inference to another endpoint with your key attached, widen the
  server's bind, or otherwise raise its own privileges.
- **The local server.** `yousim server` binds loopback and scopes CORS to
  local origins. A page you merely have open in a browser must not be able to
  read your sessions, spend your model credit, or make a state change.
- **The published package.** Path traversal or absolute paths in the tarball,
  an install-time lifecycle script, a credential baked into the artifact, a
  world-writable or non-executable installed binary.
- **The connect flow.** Anything that lets a third party complete, replay, or
  intercept the OAuth exchange, or that leaks the resulting key.
- **Storage.** Anything that reads or writes data across the `userId` boundary
  the `Storage` interface is meant to enforce.

## Out of scope

These are the documented design, not defects. Reports about them will be
closed with a pointer back to this section.

- **Your own key, on your own machine, readable by you.** The tool is BYOK by
  construction: it holds a credential you supplied, in your keychain or in a
  file your user owns, and it uses that credential when you ask it to run.
  Anything already running as your user can read your keychain and your home
  directory. That is the operating system's trust boundary, and `yousim`
  cannot and does not try to sit inside it. "The key can be recovered from the
  keychain / from `credentials.json` / from process memory as the logged-in
  user" is not a vulnerability here.
- **A `baseURL` or provider you configured yourself.** Pointing
  `OPENAI_BASE_URL` at a host of your choosing is a supported feature — it is
  how a local OpenAI-compatible server is used. If you send your traffic and
  your key somewhere, we send them there. What *is* in scope is a directory or
  file you did not author changing that endpoint behind your back; the
  distinction is who chose it.
- **Model output.** The simulator is a fiction generator and its prompts are
  deliberately unconstrained. Output that is offensive, false, self-
  contradictory, claims capabilities it does not have, or can be steered by
  what you type into it is the product working as designed, not a security
  issue. Prompt injection *within your own session* is likewise not a boundary
  we claim: you are the only party in it. Report it if untrusted content
  reaches the model from somewhere you did not put it, or if output crosses
  back out into code execution, a file write outside the data directory, or a
  request carrying your credential somewhere new.
- **A runtime you launched yourself, pointed at our bundle.** `bun
  node_modules/yousim/dist/yousim.js` from a hostile directory will run that
  directory's `bunfig.toml` `preload` before a single line of this package
  executes. That is true of `bun anything.js`: a preload runs before the
  program, so no program can defend against it from the inside.

  The shipped entry point is a command, not a file you are invited to hand to
  an interpreter. `yousim`, `bunx yousim` and `bun run yousim` are all in scope
  and all tested from a hostile directory — the shebang routes them to a
  runtime that does not read `bunfig.toml`, and
  `launcher/__tests__/hostile-dir.test.ts` fails if that stops being true. As
  with `baseURL` above, the distinction is who chose the interpreter: if you
  chose it, its configuration is yours too.

- **Denial of service against your own machine** — a prompt that costs a lot
  of tokens, a session file that grows, a model call that hangs.
- **Findings against `legacy-python/`.** It is an archived copy of the original
  implementation, is not maintained, and ships in nothing.
- **Automated scanner output with no demonstrated impact**, missing hardening
  headers on a loopback-only server, and vulnerable-dependency alerts for
  packages that are `devDependencies` or are not reachable from the published
  bundle.

## Prior review

The code has had one external security audit. Its findings were addressed
before this policy was written; the fixes are in the history and, where they
changed behaviour a user could notice, in the [changelog](CHANGELOG.md). An
audit is a snapshot and not a warranty — please still report what you find.
