#!/usr/bin/env bun

import { INITIAL_PROMPT, INITIAL_RESPONSE, Message, simulate } from "@yousim/core";
import * as readline from "readline";

// Main CLI function
async function main() {
  console.log("Welcome to YouSim CLI!");
  
  // Get provider and model from environment or command line args
  const provider = process.env.PROVIDER || "anthropic";
  const model = process.env.MODEL || "claude-sonnet-4-5-20250929";
  
  console.log(`Using provider: ${provider}, model: ${model}`);
  
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  
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
  
  // Simple conversation loop
  let name = "";
  const messages: Message[] = [];
  
  // Initial prompt
  console.log("\n\033[94mSEARCHER CLAUDE:\033[0m");
  console.log(INITIAL_PROMPT);
  
  // Add to messages history
  messages.push({ role: "user", content: INITIAL_PROMPT });
  
  // Get response
  console.log("\n\033[93mSIMULATOR CLAUDE:\033[0m");
  console.log(INITIAL_RESPONSE);
  
  // Add to messages history
  messages.push({ role: "assistant", content: INITIAL_RESPONSE });
  
  // Get name
  name = await readInput("Enter a name: ");
  
  if (name === "exit") {
    rl.close();
    process.exit(0);
  }
  
  const initialLocate = `/locate ${name}`;
  console.log("\n\033[94mSEARCHER CLAUDE:\033[0m");
  console.log(initialLocate);
  
  messages.push({ role: "user", content: initialLocate });
  
  // Get response from model
  console.log("\n\033[93mSIMULATOR CLAUDE:\033[0m");
  
  try {
    const stream = await simulate(messages, { provider, model });
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");
  } catch (error) {
    console.error("Error in conversation:", error.message);
    process.stdout.write("I'm sorry, but I encountered an error while processing your request.\n");
    rl.close();
    process.exit(1);
  }
  
  // Conversation loop
  while (true) {
    try {
      const command = await readInput(">>> ");
      
      if (command === "exit") {
        rl.close();
        process.exit(0);
      }
      
      messages.push({ role: "user", content: command });
      
      // Get response from model
      console.log("\n\033[93mSIMULATOR CLAUDE:\033[0m");
      const stream = await simulate(messages, { provider, model });
      for await (const chunk of stream.textStream) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");
    } catch (error) {
      console.error("Error in conversation loop:", error.message);
      rl.close();
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error in CLI:", error.message);
  process.exit(1);
});