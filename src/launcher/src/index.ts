#!/usr/bin/env bun

import { loadUserConfig } from "./config";

const args = process.argv.slice(2);
const command = args[0];

const printHelp = () => {
  console.log(`YouSim - Identity Simulator

Usage:
  yousim              Start the CLI (mode selection)
  yousim server       Start the API server + frontend
  yousim config       Show current configuration

Options:
  -p, --port <port>   Set server port (default: 3000)
  -h, --help          Show help

Config:
  ~/.yousim/.env or ~/.yousim/config.json (env keys take precedence)

Environment:
  PROVIDER            LLM provider: anthropic, openrouter, openai, groq
  ANTHROPIC_API_KEY   Anthropic API key (default provider)
  OPENAI_API_KEY      OpenAI API key
  GROQ_API_KEY        Groq API key
  YOUSIM_API_KEY      Optional API key for server auth
`);
};

const printConfig = () => {
  const config = loadUserConfig();

  console.log("YouSim Configuration\n");
  console.log(`Config dir: ${config.configDir}`);
  console.log(`Env file:   ${config.envPath}`);
  console.log(`JSON file:  ${config.jsonPath}\n`);

  const keys = [
    "PROVIDER", "MODEL",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY",
    "YOUSIM_API_KEY",
    "SUPABASE_URL", "SUPABASE_KEY",
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

  const storageMode = process.env.SUPABASE_URL ? "supabase" : "sqlite (~/.yousim/yousim.db)";
  const authMode = process.env.SUPABASE_URL
    ? "supabase (JWT)"
    : process.env.YOUSIM_API_KEY
      ? "apikey"
      : "local (no auth)";

  console.log(`\nStorage: ${storageMode}`);
  console.log(`Auth:    ${authMode}`);
};

if (command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

const main = async () => {
  loadUserConfig();

  if (command === "config") {
    printConfig();
    process.exit(0);
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
