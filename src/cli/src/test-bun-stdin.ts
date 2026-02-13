#!/usr/bin/env bun

console.log("Testing Bun's stdin.read functionality...");

// Function to read a line from stdin
async function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const buffer = new Uint8Array(1024);
  const bytesRead = await Bun.stdin.read(buffer);
  if (bytesRead) {
    const input = new TextDecoder().decode(buffer.subarray(0, bytesRead));
    return input.trim();
  }
  return "";
}

// Test the function
const name = await readLine("Enter your name: ");
console.log(`Hello ${name}!`);