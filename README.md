# YouSim

YouSim is a simulator that lets you simulate identities within the latent space
of Claude 3.5 Sonnet. It's live at [https://yousim.ai](https://yousim.ai)!

This repository contains both the original Python implementation and new Bun-based implementations organized in a monorepo structure:
- `packages/core`: Shared simulation logic and LLM integration
- `packages/api`: Backend API using Bun and Elysia.js
- `packages/cli`: Command-line interface using Bun

## Environment Variables

These are different values you set in a `.env` file that affect the behavior of
YouSim. Some of them are related to the web deployment for things like user
accounts and shareable links, while other's impact the core behavior of YouSim.

Create a `.env` file in the root directory by copying the template:
```bash
cp .env.template .env
```

Then fill in your API keys in the `.env` file.

Bun automatically loads environment variables from `.env` files in the current working directory. In the monorepo packages, we create symlinks to the root `.env` file so that each package automatically loads the environment variables.

There is a `PROVIDER` variable that controls which LLM provider is used by
YouSim. Currently, this only supports

- `anthropic`
- `openrouter`

If you specify `anthropic` It will use `claude-sonnet-4-5-20250929` as the model and make
use of the new [caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) feature. This also means you needs to specify a
`ANTHROPIC_API_KEY` in your `.env`.

If you specify `openrouter` you then need to provide an additional variable
called `OPENROUTER_MODEL` to specify which model you want to use. This also
means you need to specify an `OPENAI_API_KEY` in your `.env` which corresponds
to your OPENROUTER API Key.

## Self-Hosting

If you don't want to run the entire web deployment of YouSim you can run the
main conversation loop experience all from the terminal by running the `main.py`
file. This won't save conversations, let you share, or link them to any account,
but it's a quick way to get started.

Run the following commands to run the terminal experience:

```bash
poetry install
poetry run python main.py
```

Make sure you have the appropriate API keys specified in your `.env`

### Web Experience

You can run Yousim locally with Docker Compose. To get started, configure your `.env` files: `.env` for the backend and `webshell/.env` for the frontend.

For the backend, copy the `.env.template` file to `.env` and fill out the variables:

```bash
cp .env.template .env
```

`ANTHROPIC_API_KEY`: Anthropic API key  
`HONCHO_ENV`: Default value in `.env.template` goes to the [Honcho](https://github.com/plastic-labs/honcho) demo server. You'd only change this if you were running Honcho locally  
`HONCHO_APP_NAME`: This denotes your application on the Honcho demo server  
`CLIENT_REGEX`: Use default value in `.env.template`  
`JWT_SECRET`: This comes from your supabase project (more on that below)  
`SECRET_KEY`: Generate this with `python generate_fernet_key.py` -- makes links shareable without revealing information

For the frontend, copy the `.env.template` file to `.env` and fill out the variables:

```bash
cp webshell/.env.template webshell/.env
```

`VITE_API_URL`: This should be the url of your backend  
`VITE_SUPABASE_URL`: This comes from your supabase project  
`VITE_SUPABASE_KEY`: This comes from your supabase project (public key!)

### Docker

We've included a `Dockerfiles` and a `docker-compose.yml` for convenience when
running the YouSim locally.

There are some special consideration to make.

1. For the webshell front end the `.env` variables are used during build time,
   so ensure they are set correctly before building your docker images.
2. The webshell front end runs on port 3000 when running via docker so change
   your Python API `.env` `CLIENT_REGEX` to `localhost:3000` to match.

You can run both the backend and the frontend with:

```bash
docker-compose up
```

## Supabase

This project uses Supabase for account management and authentication. We made
use of the magic link and anonymous account sign features. To run this with your
own supabase project ensure you take the following steps.

1. Turn on anonymous sign ins

https://supabase.com/docs/guides/auth/auth-anonymous

2. Change the magic link email template to include the OTP Code

In your Supabase project go to Authentication > Email Templates and select the
Magic Link template. Below is an example of a template you can use:

```html
<h2>YouSim Login Code</h2>

<p>Use this code to login:</p>
<p>{{ .Token }}</p>
```

## Bun-based Components (Monorepo)

This project now includes Bun-based implementations organized in a monorepo structure:

### Monorepo Structure
- `packages/core`: Shared simulation logic and LLM integration
- `packages/api`: Backend API using Bun and Elysia.js
- `packages/cli`: Command-line interface using Bun

### Project Management Documentation

Detailed documentation about the monorepo architecture and individual modules can be found in the [PM](PM/) folder:

- [PM/monorepo-architecture.md](PM/monorepo-architecture.md) - High-level overview of the monorepo structure
- [PM/core-module.md](PM/core-module.md) - Documentation for the shared core logic
- [PM/cli-module.md](PM/cli-module.md) - Documentation for the CLI interface
- [PM/api-module.md](PM/api-module.md) - Documentation for the API service
- [PM/frontend-module.md](PM/frontend-module.md) - Documentation for the React frontend

### Setup
1. Install dependencies from the root:
```bash
bun install
```

### Running the Components

#### Backend API (packages/api)
The backend API is implemented using Bun and Elysia.js. To run it:
```bash
bun run --filter @yousim/api dev
```

Or directly from the API package:
```bash
cd packages/api
bun run dev
```

#### CLI (packages/cli)
The CLI is implemented using Bun. Due to limitations with Bun's workspace filter commands and interactive stdin, you must run it directly from the CLI package directory:

```bash
cd packages/cli
bun run dev
```

The filter command (`bun run --filter @yousim/cli dev`) does not properly handle interactive input and will exit immediately.

#### Frontend (frontend/)
The frontend is implemented using React, TypeScript, and Vite. To run it:

```bash
cd frontend
bun run dev
```

The frontend will start on port 3000. You'll need to configure the Supabase environment variables in a `.env` file in the frontend directory.

## Credits

Thanks to [nasan016](https://github.com/nasan016) for their initial work on
[webshell](https://github.com/nasan016/webshell) and [Andy
Ayrey](https://x.com/AndyAyrey) for his work on [Infinite
Backrooms](https://dreams-of-an-electric-mind.webflow.io/), whose prompts
heavily inspired this project.