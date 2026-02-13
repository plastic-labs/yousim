# YouSim

YouSim is an identity simulator that lets you explore identities within the latent space of Claude. This repository is a Bun-based monorepo (API, CLI, core, and frontend) with the legacy Python/webshell implementation preserved under `legacy-python/`.

## Repository Layout

- `src/core` (`@yousim/core`): Shared simulation logic and LLM integration
- `src/api` (`@yousim/api`): Bun/Elysia API with Supabase persistence
- `src/cli` (`@yousim/cli`): Terminal-based interface
- `src/frontend` (`@yousim/frontend`): React/Vite frontend
- `supabase/`: Local Supabase config and migrations
- `PM/`: Project management/architecture notes
- `legacy-python/`: Archived Python + webshell implementation

## Quickstart (Bun)

1. Install dependencies:

```bash
bun install
```

2. Configure environment:

```bash
cp .env.template .env
```

Fill in at least:

- `PROVIDER`, `MODEL` (or `OPENROUTER_MODEL`)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` / `OPENROUTER_API_KEY`
- `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

3. (Optional) Start local Supabase:

```bash
supabase start
```

4. Run API + frontend in dev:

```bash
bun run dev
```

- API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

5. Run the CLI:

```bash
cd src/cli
bun run start
```

## Production / Deployment

The API serves the built frontend from `src/api/public`.

1. Build the frontend into the API public directory:

```bash
bun run build
```

2. Start the API (serves API + frontend):

```bash
bun run start:api
```

3. Docker:

```bash
docker compose up --build
```

## Supabase Notes

Migrations live under `supabase/migrations` and set up:

- `users`
- `sessions`
- `messages`
- `summaries`

Anonymous sign-in is supported. Ensure your Supabase project has anonymous sign-ins enabled and the `JWT_SECRET` from your project settings in `.env`.

## Legacy Python/Webshell

The original Python API + webshell frontend are preserved under `legacy-python/` for reference. They are not used by the Bun/Elysia deployment.
