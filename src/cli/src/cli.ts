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
  MemoryStorage,
} from "@yousim/core";
import type { Storage, ModelConfig, Provider } from "@yousim/core";
import { resolveModel } from "@yousim/core";
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

// ─── Mode: Simulator ───────────────────────────────────────────────────────

async function runSimulator(rl: readline.Interface) {
  const agentOptions = getAgentOptions();
  console.log(`\nUsing provider: ${agentOptions.provider}, model: ${agentOptions.model}`);

  const commandPrompt = theme.prompt("simulator@anthropic:~$ ");

  const gaslitClaude = new GaslitClaude({ name: "", insights: "", history: [] });
  const simulator = new Simulator({ name: "", history: [] });

  // Display initial exchange
  console.log(`\n${theme.searcher("SEARCHER CLAUDE:")}`);
  console.log(theme.searcher(INITIAL_PROMPT));

  console.log(`\n${theme.simulator("SIMULATOR CLAUDE:")}`);
  console.log(theme.simulator(INITIAL_RESPONSE));

  // Get name
  const name = await readInput(rl, "Enter a name: ");

  if (name === "exit") return;

  gaslitClaude.name = name;
  simulator.name = name;

  const manual = async (command: string) => {
    let simulatorResponse = "";
    simulator.history.push({ role: "user", content: command });
    gaslitClaude.history.push({ role: "assistant", content: command });

    console.log(`\n${theme.simulator("SIMULATOR CLAUDE:")}`);
    try {
      for await (const chunk of simulator.stream(agentOptions)) {
        process.stdout.write(theme.simulator(chunk));
        simulatorResponse += chunk;
      }
      process.stdout.write("\n");
    } catch (error: any) {
      console.error("Error in conversation:", error.message);
      return;
    }

    simulator.history.push({ role: "assistant", content: simulatorResponse });
    gaslitClaude.history.push({ role: "user", content: simulatorResponse });
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

  const initialLocate = `/locate ${name}`;
  console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
  console.log(theme.command(initialLocate));

  await manual(initialLocate);

  // Conversation loop
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
}

// ─── Mode: Constructor ─────────────────────────────────────────────────────

async function runConstructor(rl: readline.Interface): Promise<{ summary: string; name: string } | null> {
  const agentOptions = getAgentOptions();
  console.log(`\nUsing provider: ${agentOptions.provider}, model: ${agentOptions.model}`);

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
