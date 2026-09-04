#!/usr/bin/env bun

import { loadUserConfig } from "./config";

const args = process.argv.slice(2);
const command = args[0];

const printHelp = () => {
  console.log(`YouSim - Identity Simulator

Usage:
  yousim              Start the CLI (mode selection)
  yousim connect      Link an OpenRouter account (OAuth, no key to paste)
  yousim disconnect   Forget the stored key
  yousim sessions     List saved sessions
  yousim resume [id]  Resume a session (picker if no id given)
  yousim server       Start the API server + frontend
  yousim config       Show current configuration

Options:
  -p, --port <port>   Set server port (default: 3000)
      --headless      With "connect": print a URL and paste the code back,
                      for SSH sessions and containers
  -h, --help          Show help

Config:
  ~/.yousim/.env or ~/.yousim/config.json (env keys take precedence)

Environment:
  PROVIDER            LLM provider: anthropic, openrouter, openai, groq
  MODEL               Model override. Choice matters a lot here: older, less
                      instruction-tuned models produce far more interesting
                      output than current frontier assistants.
  ANTHROPIC_API_KEY   Anthropic API key (default provider)
  OPENAI_API_KEY      OpenAI API key
  OPENROUTER_API_KEY  OpenRouter API key
  GROQ_API_KEY        Groq API key
  OPENAI_BASE_URL     Any OpenAI-compatible endpoint (local vLLM, Ollama)
  YOUSIM_DB           Database path override

Data:
  Conversations are saved to ~/.yousim/yousim.db and survive restarts.
  Respects XDG_DATA_HOME when set.
`);
};

const printConfig = async () => {
  const config = loadUserConfig();

  console.log("YouSim Configuration\n");
  console.log(`Config dir: ${config.configDir}`);
  console.log(`Env file:   ${config.envPath}`);
  console.log(`JSON file:  ${config.jsonPath}\n`);

  const keys = [
    "PROVIDER", "MODEL",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY",
    "OPENAI_BASE_URL",
    "PORT",
  ];

  console.log("Active settings:");
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      // Mask API keys
      const display = key.includes("KEY") || key.includes("SECRET")
        ? `${value.slice(0, 8)}...${value.slice(-4)}`
        : value;
      console.log(`  ${key}=${display}`);
    }
  }

  const { resolveDbPath } = await import("@yousim/core");
  console.log(`\nStorage: ${resolveDbPath()}`);
  const { connectionStatus } = await import("@yousim/cli/connect");
  connectionStatus();
};

if (command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

const main = async () => {
  loadUserConfig();

  if (command === "config") {
    await printConfig();
    process.exit(0);
  }

  if (command === "connect") {
    const { connect } = await import("@yousim/cli/connect");
    await connect({ headless: args.includes("--headless") });
    return;
  }

  if (command === "disconnect") {
    const { disconnect } = await import("@yousim/cli/connect");
    await disconnect();
    return;
  }

  if (command === "sessions") {
    const { listSessions } = await import("@yousim/cli");
    await listSessions();
    return;
  }

  if (command === "resume") {
    const { resumeSession } = await import("@yousim/cli");
    await resumeSession(args[1]);
    return;
  }

  if (command === "server") {
    const portIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
    if (portIndex !== -1 && args[portIndex + 1]) {
      process.env.PORT = args[portIndex + 1];
    }
    const { startServer } = await import("@yousim/api");
    startServer();
    return;
  }

  const { runCli } = await import("@yousim/cli");
  await runCli();
};

main().catch((error) => {
  console.error("Fatal error:", error?.message || error);
  process.exit(1);
});
