#!/usr/bin/env bun

import { loadUserConfig } from "./config";

const args = process.argv.slice(2);
const command = args[0];

const printHelp = () => {
  console.log(`YouSim

Usage:
  yousim              Start the CLI
  yousim server       Start the API server

Options:
  -p, --port <port>   Set server port (default: 3000)
  -h, --help          Show help

Config:
  ~/.yousim/.env or ~/.yousim/config.json (env keys take precedence)
`);
};

if (command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

const main = async () => {
  loadUserConfig();

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
