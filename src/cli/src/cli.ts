#!/usr/bin/env bun

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
import { resolveModel, setCredentialResolver, loadCredential, listCredentials } from "@yousim/core";

// A key linked with `yousim connect` should work without any env var. Env
// still wins, so CI and one-off overrides need no disconnect.
setCredentialResolver((provider: Provider) =>
  provider === "openrouter" ? loadCredential("openrouter") : undefined
);
import * as readline from "readline";
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
  // PROVIDER is user input, so validate rather than trusting the cast.
  const raw = process.env.PROVIDER ?? "anthropic";
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

/**
 * Say exactly where inference is going, and flag the case that is otherwise
 * invisible: an account was connected for one provider while env points
 * somewhere else. Env winning is deliberate, but it should never be silent.
 */
function describeTarget(options: ModelConfig) {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const endpoint =
    options.provider === "openai" && baseUrl ? baseUrl : options.provider;

  console.log(
    `\n${theme.info(`provider: ${options.provider}  model: ${options.model}  endpoint: ${endpoint}`)}`
  );

  const active = options.provider ?? "anthropic";

  // Model ids are provider-namespaced, but MODEL is global — so a name set for
  // one provider silently leaks to another. OpenRouter ids always contain a
  // "/" (vendor/model), so a bare name there is almost certainly a leftover.
  if (active === "openrouter" && options.model && !options.model.includes("/")) {
    console.log(
      theme.command(
        `  warning: "${options.model}" is not an OpenRouter model id — those look like` +
          ` "vendor/model" (e.g. meta-llama/llama-3.3-70b-instruct).\n` +
          `  MODEL applies to every provider, so a name set for a local endpoint leaks here.` +
          ` Unset MODEL or use a valid id.`
      )
    );
  }

  const connected = listCredentials().map((c) => c.provider);
  if (connected.length > 0 && !connected.includes(active)) {
    console.log(
      theme.command(
        `  note: connected to ${connected.join(", ")}, but PROVIDER=${active} is set` +
          (baseUrl ? ` (${baseUrl})` : "") +
          `.\n  That env var wins. Unset PROVIDER, or run: PROVIDER=${connected[0]} yousim`
      )
    );
  }
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

// ─── Mode: Simulator ───────────────────────────────────────────────────────

async function runSimulator(rl: readline.Interface, resumeId?: string) {
  const agentOptions = getAgentOptions();
  describeTarget(agentOptions);

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

  try {
    while (true) {
      const command = await readInput(rl, commandPrompt);

      if (command === "exit") return;

      if (command === "") {
        await auto();
        continue;
      }

      console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
      console.log(theme.command(command));
      await manual(command);
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
  describeTarget(agentOptions);

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

export async function runCli() {
  console.log("Welcome to YouSim CLI!\n");

  const rl = createRl();

  const handleExit = () => {
    rl.close();
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  console.log("Select a mode:");
  console.log("  1) Simulator  - Explore identities in the latent space");
  console.log("  2) Constructor - Build a new identity through conversation");
  console.log("  3) Chat       - Chat with a constructed identity");
  console.log("");

  const choice = await readInput(rl, "Mode (1/2/3): ");

  try {
    switch (choice) {
      case "1":
      case "simulator":
        await runSimulator(rl);
        break;
      case "2":
      case "constructor": {
        const result = await runConstructor(rl);
        if (result) {
          await runChat(rl, result.summary, result.name);
        }
        break;
      }
      case "3":
      case "chat":
        await runChat(rl);
        break;
      default:
        // Default to simulator
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
