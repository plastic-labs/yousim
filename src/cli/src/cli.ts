#!/usr/bin/env -S bun --no-env-file --config=/dev/null

// The shebang flags are load-bearing security, not style.
//
// Bun autoloads ./.env, ./.env.local, ./.env.<NODE_ENV> AND ./bunfig.toml
// before this file executes. A bunfig `preload` therefore runs arbitrary
// code from whatever directory the user happens to be standing in — `cd`
// into a cloned repo and run `yousim`, and that repo chose what ran.
//
// No in-process guard can prevent that: preload has already run by the
// time our first line does. --config=/dev/null stops bunfig, and
// --no-env-file stops every .env variant rather than the one file
// neutralizeCwdEnv can reach.
//
// Still Bun, and still flagged, even though the published launcher's shebang
// is now `#!/usr/bin/env node`. This is the Bun-invoked entry: it is
// TypeScript source with extensionless relative imports, which Node's ESM
// resolver cannot follow, so the only thing that runs this file directly is
// Bun — and under Bun every word above still applies. The launcher could drop
// the flags because Node reads neither ./.env nor any cwd-scoped config that
// executes code; that reasoning does not transfer here.
//
// The module itself is runtime-agnostic (node:fs, node:readline, no Bun
// globals) and reaches Node users through the bundle, where the launcher is
// the entry point.

import {
  GaslitClaude,
  Simulator,
  Constructor,
  Summary,
  Identity,
  Message,
  INITIAL_PROMPT,
  INITIAL_RESPONSE,
  SqliteStorage,
} from "@yousim/core";
import type { StoredSession, ModelConfig, Provider } from "@yousim/core";
import {
  resolveModel,
  setCredentialResolver,
  loadCredential,
  listCredentials,
  connectedProvider,
  neutralizeCwdEnv,
  parseInput,
  buildRegistry,
  renderHelp,
  MODEL_PRESETS,
  checkModelId,
} from "@yousim/core";
import type { MetaCommand } from "@yousim/core";

// The launcher already does this, but `yousim-cli` is its own bin and this
// module is importable directly, so the guard belongs at both entry points.
// Bun auto-loads ./.env; a cloned repo's .env must not be able to redirect
// inference with the user's credential attached. Safe to run twice — the
// second pass finds nothing left to drop. Nothing above reads env at import
// time, which is what makes this position sufficient.
//
// Silent: `yousim config` is where what-got-ignored belongs, not every launch.
neutralizeCwdEnv();

// A key linked with `yousim connect` should work without any env var. Env
// still wins, so CI and one-off overrides need no disconnect.
setCredentialResolver((provider: Provider) =>
  provider === "openrouter" ? loadCredential("openrouter") : undefined
);
import * as readline from "readline";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";


const theme = {
  prompt: chalk.hex("#6b6be8"),
  searcher: chalk.hex("#4c78ff"),
  command: chalk.hex("#c06a2a"),
  simulator: chalk.hex("#6fb0a0"),
  constructor: chalk.hex("#d4a017"),
  identity: chalk.hex("#e06c75"),
  info: chalk.hex("#888888"),
};

// Shared readline + utilities

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function readInput(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

const PROVIDERS = ["anthropic", "openrouter", "openai", "groq"] as const;

function getAgentOptions(): ModelConfig {
  // Precedence: explicit PROVIDER, then whatever account is connected, then
  // anthropic. Falling straight to anthropic would mean `yousim connect`
  // followed by `yousim` fails with "no API key" despite having just
  // connected one — the single most confusing thing this CLI could do.
  const raw = process.env.PROVIDER ?? connectedProvider() ?? "anthropic";

  // PROVIDER is user input, so validate rather than trusting the cast.
  if (!PROVIDERS.includes(raw as Provider)) {
    console.error(
      `Unsupported PROVIDER "${raw}". Supported: ${PROVIDERS.join(", ")}`
    );
    process.exit(1);
  }
  const provider = raw as Provider;
  // Model and credential resolution live in core so every surface agrees.
  return { provider, model: resolveModel({ provider }) };
}

// ─── Persistence ───────────────────────────────────────────────────────────
//
// Single local owner: this runs on your machine against your own data, so
// there is no user concept beyond "you".
const OWNER = "local";

/**
 * Writes an exchange to disk as it happens, so killing the process mid-session
 * loses at most the turn in flight.
 */
class Recorder {
  private constructor(
    private store: SqliteStorage,
    readonly session: StoredSession
  ) {}

  static async start(mode: string, name = ""): Promise<Recorder> {
    const store = new SqliteStorage();
    await store.upsertUser(OWNER, "local");
    const session = await store.createSession(OWNER, { mode, name });
    return new Recorder(store, session);
  }

  static async resume(sessionId: string): Promise<Recorder | null> {
    const store = new SqliteStorage();
    const session = await store.getSession(sessionId, OWNER);
    if (!session) return null;
    return new Recorder(store, session);
  }

  /** Prior turns, shaped for an agent's `history`. */
  async history(): Promise<Message[]> {
    const msgs = await this.store.getMessages(this.session.id, OWNER);
    return msgs.map((m) => ({
      role: m.is_user ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
  }

  // Failing to record must never take down a live conversation, so these
  // warn rather than throw.
  async user(content: string) {
    try {
      await this.store.insertMessage(this.session.id, OWNER, content, true);
    } catch (e: any) {
      console.error(theme.info(`  (not saved: ${e.message})`));
    }
  }

  async assistant(content: string) {
    try {
      await this.store.insertMessage(this.session.id, OWNER, content, false);
    } catch (e: any) {
      console.error(theme.info(`  (not saved: ${e.message})`));
    }
  }

  async summary(content: string) {
    try {
      await this.store.insertSummary(this.session.id, OWNER, content);
    } catch (e: any) {
      console.error(theme.info(`  (summary not saved: ${e.message})`));
    }
  }

  async setName(name: string) {
    await this.store.updateSessionMetadata(this.session.id, OWNER, {
      ...this.session.metadata,
      name,
    });
  }

  get path() {
    return this.store.path;
  }

  close() {
    this.store.close();
  }
}

// ─── Meta-commands ─────────────────────────────────────────────────────────
//
// Bare words, as in the original. Anything unrecognized goes to the simulator
// untouched, so `/locate chateau ruins` is never swallowed.

interface CommandDeps {
  rl: readline.Interface;
  recorder: () => Recorder;
  options: () => ModelConfig;
  setModel: (model: string) => void;
  switchTo: (sessionId: string) => void;
  resetSession: () => Promise<void>;
}

function baseCommands(deps: CommandDeps): MetaCommand[] {
  const cmds: MetaCommand[] = [
    {
      name: "help",
      description: "show this list",
      run: () => ({ output: renderHelp(registryRef!) }),
    },
    {
      name: "clear",
      description: "clear the screen, keep the session",
      run: () => ({ clear: true }),
    },
    {
      name: "sessions",
      aliases: ["session"],
      description: "list saved sessions, or switch: session <id>",
      run: async (args) => {
        if (args.length === 0) {
          const rows = await listSessions();
          return { output: rows.length === 0 ? "" : "" };
        }
        const full = await expandSessionId(args[0]!);
        if (!full) return { output: `No session matching "${args[0]}".` };
        deps.switchTo(full);
        return { exit: true, output: `Switching to ${full.slice(0, 8)}…` };
      },
    },
    {
      name: "reset",
      description: "start a new session",
      run: async () => {
        await deps.resetSession();
        return { exit: true, output: "New session." };
      },
    },
    {
      name: "export",
      description: "write this session's transcript to a file",
      run: async () => {
        const r = deps.recorder();
        const msgs = await r.history();
        const name = r.session.metadata?.name || r.session.id.slice(0, 8);
        const file = `yousim-${String(name).replace(/[^\w.-]+/g, "-").slice(0, 40)}.txt`;
        const body = msgs
          .map((m) => `${m.role === "user" ? ">" : ""} ${m.content}`.trim())
          .join("\n\n");
        // `node:fs` rather than `Bun.write`: the same call on both runtimes.
        await writeFile(file, body + "\n");
        return { output: `Wrote ${msgs.length} messages to ${file}` };
      },
    },
    {
      name: "model",
      description: "show or switch the model: model <id>",
      run: (args) => {
        const opts = deps.options();
        const provider = opts.provider ?? "anthropic";
        if (args.length === 0) {
          const baseUrl = process.env.OPENAI_BASE_URL;
          const endpoint = provider === "openai" && baseUrl ? baseUrl : provider;
          const notes: string[] = [];

          // MODEL is global while ids are provider-namespaced, so a name set
          // for one provider leaks to another and fails opaquely at request
          // time. Surfaced here rather than at startup: this is where someone
          // is actually asking about the model.
          const check = checkModelId(provider, opts.model ?? "");
          if (!check.ok) notes.push(`  warning: ${check.reason}`);

          const connected = listCredentials().map((c) => c.provider);
          if (process.env.PROVIDER && connected.length && !connected.includes(provider)) {
            notes.push(
              `  note: connected to ${connected.join(", ")}, but PROVIDER=${provider} is set.` +
                ` Run "yousim config" to see which layer won.`
            );
          }

          const lines = [
            `provider: ${provider}`,
            `model:    ${opts.model}`,
            `endpoint: ${endpoint}`,
            ...notes,
            "",
            `presets for ${provider}:`,
            ...MODEL_PRESETS[provider].map(
              (m) =>
                `  ${m.id === opts.model ? "*" : " "} ${m.id}` +
                `\n      ${m.note}`
            ),
            "",
            "switch with: model <id>",
          ];
          return { output: lines.join("\n") };
        }
        const wanted = args.join(" ");
        const check = checkModelId(provider, wanted);
        if (!check.ok) return { output: `  ${check.reason}` };
        deps.setModel(wanted);
        return { output: `model: ${wanted}` };
      },
    },
    {
      name: "connect",
      description: "link an OpenRouter account",
      run: async () => {
        const { connect } = await import("./connect");
        await connect({});
        return { output: "" };
      },
    },
    {
      name: "mode",
      description: "switch mode: mode <simulator|constructor|chat>",
      run: (args) => {
        const wanted = args[0];
        if (!wanted) {
          return { output: `current mode: ${process.env.YOUSIM_MODE ?? "simulator"}` };
        }
        if (!["simulator", "constructor", "chat"].includes(wanted)) {
          return { output: `unknown mode "${wanted}" — simulator, constructor, or chat` };
        }
        // Switching rebuilds the agents, so leave the loop and re-enter. The
        // original reloaded the page for the same reason.
        process.env.YOUSIM_MODE = wanted;
        pendingMode = wanted as Mode;
        return { exit: true, output: `mode: ${wanted}` };
      },
    },
    {
      name: "exit",
      aliases: ["quit"],
      description: "leave",
      run: () => ({ exit: true }),
    },
  ];
  return cmds;
}

// `help` renders from the live registry, so it can never advertise a command
// that isn't wired — which is how `share` ended up documented but missing.
let registryRef: Map<string, MetaCommand> | null = null;
let pendingMode: Mode | null = null;

// ─── Mode: Simulator ───────────────────────────────────────────────────────

async function runSimulator(rl: readline.Interface, resumeId?: string) {
  const agentOptions = getAgentOptions();

  const commandPrompt = theme.prompt("simulator@anthropic:~$ ");

  const gaslitClaude = new GaslitClaude({ name: "", insights: "", history: [] });
  const simulator = new Simulator({ name: "", history: [] });

  let recorder: Recorder;
  let name: string;

  if (resumeId) {
    const resumed = await Recorder.resume(resumeId);
    if (!resumed) {
      console.error(`No session ${resumeId}. Try: yousim sessions`);
      return;
    }
    recorder = resumed;
    name = recorder.session.metadata?.name ?? "";

    // Replay so the agents see the same conversation the user does. The
    // searcher's view is the simulator's with roles swapped.
    const prior = await recorder.history();
    simulator.history = prior;
    gaslitClaude.history = prior.map((m) => ({
      role: m.role === "user" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
    simulator.name = name;
    gaslitClaude.name = name;

    console.log(theme.info(`\nResuming "${name}" — ${prior.length} prior messages\n`));
    for (const m of prior) {
      const paint = m.role === "user" ? theme.command : theme.simulator;
      console.log(paint(m.content));
    }
  } else {
    console.log(`\n${theme.searcher("SEARCHER CLAUDE:")}`);
    console.log(theme.searcher(INITIAL_PROMPT));

    console.log(`\n${theme.simulator("SIMULATOR CLAUDE:")}`);
    console.log(theme.simulator(INITIAL_RESPONSE));

    name = await readInput(rl, "Enter a name: ");
    if (name === "exit") return;

    gaslitClaude.name = name;
    simulator.name = name;

    recorder = await Recorder.start("simulator", name);
    console.log(theme.info(`  saving to ${recorder.path}`));
  }

  const manual = async (command: string) => {
    let simulatorResponse = "";
    simulator.history.push({ role: "user", content: command });
    gaslitClaude.history.push({ role: "assistant", content: command });
    await recorder.user(command);

    console.log(`\n${theme.simulator("SIMULATOR CLAUDE:")}`);
    try {
      for await (const chunk of simulator.stream(agentOptions)) {
        process.stdout.write(theme.simulator(chunk));
        simulatorResponse += chunk;
      }
      process.stdout.write("\n");
    } catch (error: any) {
      console.error("Error in conversation:", error.message);
      // Persist whatever streamed before the failure rather than dropping it.
      if (simulatorResponse) await recorder.assistant(simulatorResponse);
      return;
    }

    simulator.history.push({ role: "assistant", content: simulatorResponse });
    gaslitClaude.history.push({ role: "user", content: simulatorResponse });
    await recorder.assistant(simulatorResponse);
  };

  const auto = async () => {
    let gaslitResponse = "";
    console.log(`\n${theme.searcher("SEARCHER CLAUDE:")}`);

    try {
      for await (const chunk of gaslitClaude.stream(agentOptions)) {
        process.stdout.write(theme.searcher(chunk));
        gaslitResponse += chunk;
      }
      process.stdout.write("\n");
    } catch (error: any) {
      console.error("Error in auto conversation:", error.message);
      return;
    }

    await manual(gaslitResponse);
  };

  if (!resumeId) {
    const initialLocate = `/locate ${name}`;
    console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
    console.log(theme.command(initialLocate));
    await manual(initialLocate);
  }

  // Registry is built here because the commands close over this session's
  // recorder and options.
  let switchToId: string | null = null;
  const registry = buildRegistry(
    baseCommands({
      rl,
      recorder: () => recorder,
      options: () => agentOptions,
      setModel: (m) => {
        agentOptions.model = m;
      },
      switchTo: (id) => {
        switchToId = id;
      },
      resetSession: async () => {
        recorder.close();
        recorder = await Recorder.start("simulator", name);
      },
    })
  );
  registryRef = registry;

  try {
    while (true) {
      const input = await readInput(rl, commandPrompt);
      const parsed = parseInput(input, registry.keys());

      if (parsed.kind === "auto") {
        await auto();
        continue;
      }

      if (parsed.kind === "meta") {
        const result = await registry.get(parsed.name)!.run(parsed.args);
        if (result.clear) console.clear();
        if (result.output) console.log(result.output);
        if (result.exit) return;
        continue;
      }

      // Anything else is the simulator's, verbatim.
      console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
      console.log(theme.command(parsed.text));
      await manual(parsed.text);
    }
  } finally {
    console.log(theme.info(`\n  session ${recorder.session.id}`));
    console.log(theme.info(`  resume with: yousim resume ${recorder.session.id}`));
    recorder.close();
  }
}

// ─── Mode: Constructor ─────────────────────────────────────────────────────

async function runConstructor(rl: readline.Interface): Promise<{ summary: string; name: string } | null> {
  const agentOptions = getAgentOptions();

  const constructorPrompt = theme.constructor("constructor> ");

  console.log(theme.info("\nIdentity Constructor"));
  console.log(theme.info('Build a new identity through conversation. Type "done" when finished.\n'));

  const name = await readInput(rl, theme.constructor("What name should this identity have? "));
  if (name === "exit") return null;

  const constructorHistory: Message[] = [];
  const constructor = new Constructor({ history: [] });

  // First message is the name
  constructor.history.push({ role: "user", content: name });
  constructorHistory.push({ role: "user", content: name });

  // Get first constructor response
  let constructorResponse = "";
  console.log(`\n${theme.constructor("CONSTRUCTOR:")}`);
  for await (const chunk of constructor.stream(agentOptions)) {
    process.stdout.write(theme.constructor(chunk));
    constructorResponse += chunk;
  }
  process.stdout.write("\n\n");

  constructor.history.push({ role: "assistant", content: constructorResponse });
  constructorHistory.push({ role: "assistant", content: constructorResponse });

  // Conversation loop
  while (true) {
    const input = await readInput(rl, constructorPrompt);

    if (input === "exit") return null;

    if (input === "done") {
      console.log(theme.info("\nGenerating identity summary..."));
      break;
    }

    constructor.history.push({ role: "user", content: input });
    constructorHistory.push({ role: "user", content: input });

    constructorResponse = "";
    console.log(`\n${theme.constructor("CONSTRUCTOR:")}`);
    for await (const chunk of constructor.stream(agentOptions)) {
      process.stdout.write(theme.constructor(chunk));
      constructorResponse += chunk;
    }
    process.stdout.write("\n\n");

    constructor.history.push({ role: "assistant", content: constructorResponse });
    constructorHistory.push({ role: "assistant", content: constructorResponse });
  }

  // Generate summary
  const summaryAgent = new Summary({ history: constructorHistory });
  let summaryText = "";
  for await (const chunk of summaryAgent.stream(agentOptions)) {
    process.stdout.write(theme.info(chunk));
    summaryText += chunk;
  }
  process.stdout.write("\n\n");

  console.log(theme.info("Identity summary generated."));

  // Ask if they want to chat
  const chatChoice = await readInput(
    rl,
    theme.info("Would you like to chat with this identity? (yes/no) ")
  );

  if (chatChoice === "yes" || chatChoice === "y") {
    return { summary: summaryText, name };
  }

  return null;
}

// ─── Mode: Chat ────────────────────────────────────────────────────────────

async function runChat(rl: readline.Interface, summary?: string, identityName?: string) {
  const agentOptions = getAgentOptions();

  let activeSummary = summary;
  let name = identityName || "";

  if (!activeSummary) {
    console.log(theme.info("\nChat Mode"));
    console.log(theme.info("Paste or type the identity summary, then press Enter twice when done:\n"));

    let lines: string[] = [];
    let emptyCount = 0;
    while (true) {
      const line = await readInput(rl, "");
      if (line === "") {
        emptyCount++;
        if (emptyCount >= 1) break;
      } else {
        emptyCount = 0;
        lines.push(line);
      }
    }
    activeSummary = lines.join("\n");

    if (!activeSummary.trim()) {
      console.log(theme.info("No summary provided. Exiting chat mode."));
      return;
    }

    if (!name) {
      name = await readInput(rl, theme.identity("Identity name: "));
    }
  }

  console.log(theme.info("\nInitializing identity (this may take a moment)..."));

  const firstInput = await readInput(rl, theme.identity(`${name}> `));
  if (firstInput === "exit") return;

  const identity = new Identity(activeSummary, firstInput);
  await identity.initialize(agentOptions);

  // Stream first response
  let responseText = "";
  console.log(`\n${theme.identity(`${name}:`)}`);
  for await (const chunk of identity.stream(agentOptions)) {
    process.stdout.write(theme.identity(chunk));
    responseText += chunk;
  }
  process.stdout.write("\n\n");

  identity.history.push({ role: "user", content: firstInput });
  identity.history.push({ role: "assistant", content: responseText });

  // Chat loop
  const chatPrompt = theme.identity(`${name}> `);
  while (true) {
    const input = await readInput(rl, chatPrompt);

    if (input === "exit") return;
    if (!input) continue;

    identity.userInput = input;
    responseText = "";
    console.log(`\n${theme.identity(`${name}:`)}`);
    for await (const chunk of identity.stream(agentOptions)) {
      process.stdout.write(theme.identity(chunk));
      responseText += chunk;
    }
    process.stdout.write("\n\n");

    identity.history.push({ role: "user", content: input });
    identity.history.push({ role: "assistant", content: responseText });
  }
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export async function listSessions() {
  const store = new SqliteStorage();
  try {
    const sessions = await store.getSessions(OWNER);
    if (sessions.length === 0) {
      console.log("No saved sessions yet.");
      console.log(theme.info(`  (${store.path})`));
      return [];
    }

    console.log(`Saved sessions (${store.path}):\n`);
    const rows: { id: string; label: string }[] = [];
    for (const s of sessions) {
      const msgs = await store.getMessages(s.id, OWNER);
      const mode = s.metadata?.mode ?? "?";
      const name = s.metadata?.name || theme.info("(unnamed)");
      const when = s.created_at.slice(0, 16).replace("T", " ");
      console.log(
        `  ${theme.prompt(s.id.slice(0, 8))}  ${when}  ${String(mode).padEnd(11)} ` +
          `${String(msgs.length).padStart(3)} msgs  ${name}`
      );
      rows.push({ id: s.id, label: `${name} (${mode})` });
    }
    console.log(theme.info("\n  yousim resume <id>   — ids may be abbreviated"));
    return rows;
  } finally {
    store.close();
  }
}

/** Accepts an abbreviated id, as printed by `yousim sessions`. */
async function expandSessionId(prefix: string): Promise<string | null> {
  const store = new SqliteStorage();
  try {
    const sessions = await store.getSessions(OWNER);
    const matches = sessions.filter((s) => s.id.startsWith(prefix));
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) {
      console.error(`"${prefix}" matches ${matches.length} sessions. Use more characters.`);
      return null;
    }
    return null;
  } finally {
    store.close();
  }
}

export async function resumeSession(idOrPrefix?: string) {
  const rl = createRl();
  try {
    let id = idOrPrefix;

    if (!id) {
      const rows = await listSessions();
      if (rows.length === 0) return;
      const pick = await readInput(rl, "\nSession id (or blank to cancel): ");
      if (!pick) return;
      id = pick;
    }

    const full = await expandSessionId(id);
    if (!full) {
      console.error(`No session matching "${id}". Try: yousim sessions`);
      return;
    }

    const store = new SqliteStorage();
    const session = await store.getSession(full, OWNER);
    const mode = session?.metadata?.mode;
    store.close();

    if (mode === "simulator") {
      await runSimulator(rl, full);
    } else {
      // Constructor and chat sessions resume into chat: their value is the
      // resulting identity, not replaying the construction interview.
      const s2 = new SqliteStorage();
      const summary = await s2.getLatestSummary(full, OWNER);
      s2.close();
      if (!summary) {
        console.error("That session has no summary to chat with yet.");
        return;
      }
      await runChat(rl, summary.content, session?.metadata?.name);
    }
  } finally {
    rl.close();
  }
}

// ─── Mode Selection ────────────────────────────────────────────────────────

/**
 * Which mode to open in. Persisted so `mode` survives the process restart
 * that switching requires, mirroring how the original stored it client-side.
 */
type Mode = "simulator" | "constructor" | "chat";

function initialMode(): Mode {
  const stored = process.env.YOUSIM_MODE;
  if (stored === "constructor" || stored === "chat") return stored;
  return "simulator";
}

export async function runCli(requestedMode?: Mode) {
  const rl = createRl();

  const handleExit = () => {
    rl.close();
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  // No mode menu. The original showed a banner and dropped you straight into
  // the simulator with "Enter a Name to Simulate"; you typed `mode
  // constructor` to move. A launch-time menu is a gate the original didn't
  // have, and without an in-session `mode` it was a one-way door.
  const mode = requestedMode ?? initialMode();

  try {
    switch (mode) {
      case "constructor": {
        const result = await runConstructor(rl);
        if (result) await runChat(rl, result.summary, result.name);
        break;
      }
      case "chat":
        await runChat(rl);
        break;
      default:
        await runSimulator(rl);
        break;
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

if (import.meta.main) {
  runCli().catch((error) => {
    console.error("Fatal error in CLI:", error.message);
    process.exit(1);
  });
}
