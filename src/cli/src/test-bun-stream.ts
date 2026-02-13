#!/usr/bin/env bun

console.log("Testing Bun's stream reader functionality...");

// Create a stream reader for stdin
const reader = new ReadableStreamDefaultReader(Bun.stdin.stream());

// Function to read a line from stdin
async function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  
  let line = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    const chunk = new TextDecoder().decode(value);
    line += chunk;
    
    // Check if we have a complete line
    if (line.includes("\n")) {
      return line.trim();
    }
  }
  
  return line.trim();
}

try {
  // Test the function
  const name = await readLine("Enter your name: ");
  console.log(`Hello ${name}!`);
} catch (error) {
  console.error("Error reading input:", error);
}