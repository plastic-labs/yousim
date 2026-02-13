#!/usr/bin/env bun

import {
  GaslitClaude,
  Simulator,
  Message,
  INITIAL_PROMPT,
  INITIAL_RESPONSE
} from "@yousim/core";
import * as readline from "readline";
import chalk from "chalk";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const theme = {
  prompt: chalk.hex("#6b6be8"),
  searcher: chalk.hex("#4c78ff"),
  command: chalk.hex("#c06a2a"),
  simulator: chalk.hex("#6fb0a0"),
};

// Main CLI function
export async function runCli() {
  console.log("Welcome to YouSim CLI!");
  
  // Get provider and model from environment or command line args
  const provider = process.env.PROVIDER || "anthropic";
  const model =
    process.env.MODEL ||
    process.env.OPENROUTER_MODEL ||
    DEFAULT_MODEL;
  
  console.log(`Using provider: ${provider}, model: ${model}`);
  const agentOptions = { provider, model };
  
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  
  const commandPrompt = theme.prompt("simulator@anthropic:~$ ");

  // Utility function for reading input
  const readInput = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };
  
  // Handle exit gracefully
  const handleExit = () => {
    rl.close();
    process.exit(0);
  };
  
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
  
  // Agent state
  let name = "";
  const gaslitClaude = new GaslitClaude({ name: "", insights: "", history: [] });
  const simulator = new Simulator({ name: "", history: [] });

  // Display initial exchange
  console.log(`\n${theme.searcher("SEARCHER CLAUDE:")}`);
  console.log(theme.searcher(INITIAL_PROMPT));

  console.log(`\n${theme.simulator("SIMULATOR CLAUDE:")}`);
  console.log(theme.simulator(INITIAL_RESPONSE));

  // Get name
  name = await readInput("Enter a name: ");

  if (name === "exit") {
    rl.close();
    process.exit(0);
  }

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
    } catch (error) {
      console.error("Error in conversation:", error.message);
      process.stdout.write("I'm sorry, but I encountered an error while processing your request.\n");
      rl.close();
      process.exit(1);
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
    } catch (error) {
      console.error("Error in auto conversation:", error.message);
      rl.close();
      process.exit(1);
    }

    await manual(gaslitResponse);
  };

  const initialLocate = `/locate ${name}`;
  console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
  console.log(theme.command(initialLocate));

  await manual(initialLocate);
  
  // Conversation loop
  while (true) {
    try {
      const command = await readInput(commandPrompt);
      
      if (command === "exit") {
        rl.close();
        process.exit(0);
      }
      
      if (command === "") {
        await auto();
        continue;
      }

      console.log(`\n${theme.command("SIMULATOR CLAUDE:")}`);
      console.log(theme.command(command));
      await manual(command);
    } catch (error) {
      console.error("Error in conversation loop:", error.message);
      rl.close();
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  runCli().catch((error) => {
    console.error("Fatal error in CLI:", error.message);
    process.exit(1);
  });
}
