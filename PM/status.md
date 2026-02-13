# Migration Status (Bun/Elysia + Supabase)

This is a working snapshot of the current migration state and what remains.

## Completed
- Monorepo is Bun workspaces with `@yousim/core`, `@yousim/cli`, `@yousim/api`, `@yousim/frontend`, and `@yousim/launcher`.
- API runs on Bun + Elysia and serves the built frontend from `src/api/public`.
- Supabase is the primary datastore and auth source (sessions/messages/users) without Honcho.
- Supabase JWT verification uses JWKS (`jose`), with optional overrides for issuer/JWKS URL.
- `/sessions` filtering uses `metadata->>mode` to avoid 500 errors.
- CLI supports prefilled context, simulator prompt, chalk styling, and uses core agents.
- Web frontend now matches the legacy webshell layout and command list, and uses streaming output.
- Streaming flow:
  - `/auto` streams the Gaslit Claude command.
  - `/manual` streams the Simulator response and persists the assistant message.
- Single launcher command added:
  - `yousim` starts the CLI.
  - `yousim server` starts the API server.
- Launcher reads config from `~/.yousim/.env` or `~/.yousim/config.json`.

## In Progress / Needs Validation
- Verify the launcher package can be published to npm (Bun-required install).
- Verify server and CLI work end-to-end with config in `~/.yousim`.
- Verify frontend parity and command flow against the legacy webshell for edge cases.

## Next Steps
- Add publishable npm metadata and versioning for `@yousim/launcher`, `@yousim/cli`, `@yousim/api`, `@yousim/core`.
- Replace `workspace:*` with real semver versions for published packages.
- Add a small `yousim config set/get` command (optional) to manage `~/.yousim/config.json`.
- Add a smoke test checklist (CLI, server, frontend) before tagging a release.
