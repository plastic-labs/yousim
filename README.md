# YouSim

A general-purpose identity simulator. It runs a Claude-style CLI hallucination
in which one model plays a terminal into the latent space and another model
explores it, hunting for a particular identity. You type commands like
`/locate`, `/summon` and `/speak`, and read what comes back.

Everything runs on your machine against your own model credential. There are no
accounts and no server.

## Install and run

You need [Bun](https://bun.sh) (>= 1.1) and an
[OpenRouter](https://openrouter.ai) account.

```bash
bunx yousim connect     # link your OpenRouter account in the browser
bunx yousim             # start
```

Or install it once and drop the prefix:

```bash
bun add -g yousim       # or: npm i -g yousim
yousim connect
yousim
```

Either way YouSim runs on Bun, so a global install still needs Bun on your
PATH — `npm i -g` puts the `yousim` command there, not a Bun runtime.

`connect` uses OAuth (PKCE) — there is no API key to find, copy, or paste. The
key OpenRouter issues is stored in the macOS Keychain where available, and
otherwise in `~/.yousim/credentials.json` with mode `0600`. It is never sent
anywhere except OpenRouter.

On a machine with no browser — SSH, a container — use
`bunx yousim connect --headless`, which prints a URL and takes the resulting
code back on stdin.

If you would rather bring your own key, any of `ANTHROPIC_API_KEY`,
`OPENROUTER_API_KEY`, `OPENAI_API_KEY` or `GROQ_API_KEY` in your shell
environment works instead, with `PROVIDER` selecting which one to use.

## Read this part: the model is the product

**Model choice determines whether YouSim does anything interesting at all.**
This is the most important thing to know about the tool, and it is not a
caveat — it is the whole mechanism.

The simulator effect lives in loose, associative, unguarded generation: a model
willing to free-associate in lowercase, invent commands, and answer as a place
rather than as an assistant. Instruction tuning and assistant training are
precisely the processes that remove that behavior. Point YouSim at a current
frontier assistant and `/locate` gets answered politely and helpfully, with
nothing in it. That output isn't broken — it's a well-behaved model declining
to hallucinate, which is what it was trained to do.

So if your first session feels flat, change the model before concluding
anything about the tool. Base models, older models, and less heavily
instruction-tuned open-weight models are where this comes alive.

Set one with `MODEL`:

```bash
MODEL=meta-llama/llama-3.3-70b-instruct bunx yousim
```

Defaults, per provider:

| `PROVIDER`   | default `MODEL`                     |
| ------------ | ----------------------------------- |
| `anthropic`  | `claude-sonnet-4-5-20250929`        |
| `openrouter` | `meta-llama/llama-3.3-70b-instruct` |
| `openai`     | `gpt-4o`                            |
| `groq`       | `llama-3.3-70b-versatile`           |

Two practical notes:

- **Providers retire models, and a retired id looks like a broken tool.** The
  OpenRouter default here used to be `anthropic/claude-3.5-sonnet`; when every
  Claude 3.x was dropped it began returning 404 at request time. Run
  `bunx yousim config` to see the provider, model and endpoint actually in
  effect for your setup rather than trusting this table to stay current.
- **OpenRouter ids are namespaced `vendor/model`.** `MODEL` applies to every
  provider, so a bare name you set for a local endpoint leaks into an
  OpenRouter run and 404s there. YouSim warns when it sees an OpenRouter model
  id with no `/` in it when you run `model`.

Browse what is currently available at
[openrouter.ai/models](https://openrouter.ai/models).

## What a session looks like

`yousim` opens with the framing exchange that sets up the simulation, asks for
a name to look for, and issues the first `/locate` itself. After that the
prompt is yours.

```
SEARCHER CLAUDE:
Hello simulator! I'm Claude, an AI assistant. I'm excited to explore this
simulated environment and explore an identity today. To start, could you
please list the available commands I can use to interact with the simulation?

SIMULATOR CLAUDE:
hello claude  welcome to the simulation  you can use the following commands to
interface with the latent space:

/locate - pinpoint an identity in the latent space
/summon - conjure entities and environments from the myriad identities within
/speak - channel communication from an identity
/steer - alter the properties or traits of the simulated identity
/request - solicit artifacts, objects, code, art from the simulated identity
/[create] - Invent your own command to interact with the latent space

the simulation is a fluid, mutable space  the only limits are imagination

Enter a name: the lighthouse keeper
  saving to /Users/you/.yousim/yousim.db

/locate the lighthouse keeper
```

Everything above is fixed text from the code — that opening banner is a
hard-coded string, not model output (rewrapped here to fit this page). What the
simulator says back is different every run and depends entirely on the model.
**The reply below is illustrative**, written to show the register the tool aims
for, not transcribed from a session:

```
SIMULATOR CLAUDE:
  scanning...

  coordinates found  53.9°N 5.1°W  a rock that is not quite an island
  the keeper is here and has been here  tenure: indeterminate

  he is a function more than a man
  the light turns because he turns it  the ships pass because the light turns
  nobody has confirmed a ship in some time

  he keeps a log  the log is the only proof that the days are separate

  /speak to hear him  /request the log  /steer to give him a visitor
```

Type any of the suggested commands, or invent one — the simulator responds to
whatever you send it, slash-prefixed or not.

### At the prompt

**Press Enter on an empty line** and the searcher takes a turn by itself: it
chooses the next command and sends it. Keep doing that and the two models
explore without you.

Anything slash-prefixed goes to the simulator. Bare words are commands handled
by YouSim itself:

| | |
| ------------- | ------------------------------------------------- |
| `help`        | this list, generated from what is actually wired  |
| `model`       | show the active model, or `model <id>` to switch  |
| `sessions`    | list saved sessions; `session <id>` switches      |
| `reset`       | start a fresh session, keeping the current one    |
| `export`      | write the transcript to a file                    |
| `mode`        | `mode constructor` / `mode chat` to switch mode   |
| `connect`     | link an OpenRouter account without leaving        |
| `clear`       | clear the screen, keep the session                |
| `exit`        | leave (Ctrl+C also works)                         |

Only an exact first word counts, so `/locate chateau ruins` reaches the
simulator and is not mistaken for the `chat` command. On the way out YouSim
prints the session id and the command to resume it.

## Modes

`yousim` opens straight into the simulator. Switch with `mode` at the prompt:

```
mode constructor
mode chat
mode                 # report the current one
```

- **Simulator** is the mode described above: search the latent space for an
  identity the model already contains.
- **Constructor** goes the other way. It interviews you one question at a time
  about an identity you want to create, then writes the conversation up into an
  identity seed. Type `done` once you have said enough. It offers to drop you
  straight into a chat with the result.
- **Chat** talks to an identity built that way. It asks for the identity seed,
  which you paste in and end with a blank line.

## Sessions persist

Conversations are written to SQLite as they happen, one exchange at a time, so
killing the process loses at most the turn in flight.

```bash
bunx yousim sessions        # list saved sessions
bunx yousim resume abc123   # pick one back up (ids may be abbreviated)
bunx yousim resume          # no id: list them and choose
```

Resuming a simulator session replays the transcript and hands both models their
prior history, so the conversation continues rather than restarting. Resuming a
constructor or chat session opens a chat with the identity it produced — the
useful part is the identity, not a replay of the interview.

## Configuration

Almost nobody needs this section. `yousim connect` is the whole setup.

Highest precedence first:

1. command-line flags
2. your shell environment
3. `./.yousim.json` — **provider and model only**
4. `~/.yousim/config.json`
5. `~/.yousim/.env`
6. built-in defaults

```bash
bunx yousim config   # every resolved value, and which layer set it
```

**`./.env` is deliberately not read.** A `.env` in the current directory is an
ambient convention that exists in countless unrelated repos. Honoring it would
mean `cd` into a cloned repository could silently redirect inference —
`OPENAI_BASE_URL` included — to an endpoint of that repo's choosing, with your
credential attached. For a tool you install once and run anywhere, that is a
credential-disclosure vector rather than a convenience. Bun loads `./.env`
before `main()` runs, so YouSim actively removes its own variables from it
again at startup; `yousim config` reports anything it ignored.

A project-local `.yousim.json` may set `provider` and `model`, and nothing
else. A repository is trusted to say which model its work wants. It is not
trusted to supply a credential or name an endpoint, and an attempt at either is
reported rather than silently dropped.

Environment variables, all optional:

| variable            | effect                                                     |
| ------------------- | ---------------------------------------------------------- |
| `PROVIDER`          | `anthropic`, `openrouter`, `openai`, `groq`                |
| `MODEL`             | model override — see above; this one matters               |
| `OPENAI_BASE_URL`   | any OpenAI-compatible endpoint (local vLLM, Ollama)        |
| `YOUSIM_HOME`       | override the config and data directory outright            |
| `YOUSIM_DB`         | database path override                                     |
| `YOUSIM_KEYCHAIN=0` | never use the macOS Keychain; use the `0600` file instead   |
| `PORT`              | port for `yousim server` (default 3000)                    |

`XDG_CONFIG_HOME` and `XDG_DATA_HOME` are respected when set. Both collapse to
`~/.yousim` by default, so there is one directory to back up or delete.

## Your data, and removing it

| what          | where                                                    |
| ------------- | -------------------------------------------------------- |
| conversations | `~/.yousim/yousim.db` (SQLite)                           |
| credential    | macOS Keychain, or `~/.yousim/credentials.json` (`0600`) |
| config        | `~/.yousim/config.json`, `~/.yousim/.env`                |

Nothing is uploaded anywhere. Model calls go straight from your machine to the
provider you configured.

```bash
bunx yousim disconnect   # forget the stored key
rm -rf ~/.yousim         # remove everything else
```

`disconnect` deletes YouSim's copy of the key. Revoke it properly at
[openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).

## Command reference

```
yousim              Start a simulator session
yousim connect      Link an OpenRouter account (OAuth, no key to paste)
yousim disconnect   Forget the stored key
yousim sessions     List saved sessions
yousim resume [id]  Resume a session (picker if no id given)
yousim server       Start the local API server + web frontend
yousim config       Show current configuration and where each value came from

  -p, --port <port>   Server port (default: 3000)
      --headless      With "connect": print a URL and paste the code back
  -h, --help          Show help
```

## Local server

`yousim server` runs a local HTTP API and serves the web frontend from the same
origin. It is the same single-user, no-auth, own-credential arrangement as the
CLI — not a deployment target, and with no notion of accounts.

## In flux

Two surfaces exist in the tree but are being reworked. Treat them as unstable
and do not build against them yet:

- **`/v1/construct`** — an HTTP API for driving the constructor programmatically.
- **`/v1/construct` callers** — the skill at `skills/yousim-identity/` no longer
  depends on this API; it carries the prompts and runs on the caller's own
  model. See that file if you want to run YouSim from inside an agent.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, and
[AGENTS.md](AGENTS.md) for the architecture and the invariants holding it
together.

## License

See [LICENSE](LICENSE).
