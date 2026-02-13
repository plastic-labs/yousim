#!/usr/bin/env bun

import { INITIAL_PROMPT, INITIAL_RESPONSE, Message, simulate } from "@yousim/core";

console.log("Testing YouSim CLI...");
console.log("Initial prompt:", INITIAL_PROMPT);
console.log("Initial response:", INITIAL_RESPONSE);

// Test that we can import the core module
const testMessages: Message[] = [
  { role: "user", content: "Test message" }
];

console.log("Core module imported successfully!");
console.log("Test messages array:", testMessages);

// Just exit normally for this test
process.exit(0);