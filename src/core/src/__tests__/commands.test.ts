import { expect, test } from "bun:test";
import { parseInput, buildRegistry, renderHelp } from "../commands";
import { MODEL_PRESETS, defaultModelFor, checkModelId } from "../models";
import type { MetaCommand } from "../commands";

const stub = (name: string, aliases?: string[]): MetaCommand => ({
  name,
  description: `does ${name}`,
  aliases,
  run: () => ({}),
});

const registry = buildRegistry([
  stub("help"),
  stub("clear"),
  stub("chat"),
  stub("reset"),
  stub("sessions", ["session"]),
  stub("model"),
]);
const names = () => registry.keys();

test("bare command words dispatch as meta", () => {
  expect(parseInput("help", names())).toMatchObject({ kind: "meta", name: "help" });
  expect(parseInput("reset", names())).toMatchObject({ kind: "meta", name: "reset" });
});

test("a longer line starting with a command word is NOT swallowed", () => {
  // The original used startsWith, so `startsWith("chat")` matched "chateau"
  // and an identity named "chateau ruins" triggered the chat command instead
  // of a simulation. This is that regression.
  expect(parseInput("chateau ruins", names())).toEqual({
    kind: "simulation",
    text: "chateau ruins",
  });
  expect(parseInput("resetting the world", names())).toMatchObject({ kind: "simulation" });
  expect(parseInput("sessions of a lost era", names())).toMatchObject({ kind: "meta", name: "sessions" });
});

test("arguments are split off the first token", () => {
  const r = parseInput("session abc123", names());
  expect(r).toMatchObject({ kind: "meta", name: "session" });
  if (r.kind === "meta") expect(r.args).toEqual(["abc123"]);
});

test("simulation commands are never intercepted", () => {
  for (const cmd of ["/locate x", "/summon y", "/speak", "/reset", "/help"]) {
    expect(parseInput(cmd, names())).toMatchObject({ kind: "simulation" });
  }
});

test("empty input means auto-advance", () => {
  expect(parseInput("", names())).toEqual({ kind: "auto" });
  expect(parseInput("   ", names())).toEqual({ kind: "auto" });
});

test("dispatch is case-insensitive", () => {
  expect(parseInput("RESET", names())).toMatchObject({ kind: "meta", name: "reset" });
  expect(parseInput("Help", names())).toMatchObject({ kind: "meta", name: "help" });
});

test("aliases resolve to the same command", () => {
  expect(registry.get("session")).toBe(registry.get("sessions"));
});

test("duplicate names are rejected at registration, not silently shadowed", () => {
  expect(() => buildRegistry([stub("a"), stub("a")])).toThrow(/Duplicate/);
  expect(() => buildRegistry([stub("a"), stub("b", ["a"])])).toThrow(/Duplicate/);
});

test("help renders from the registry, so it cannot advertise a missing command", () => {
  const help = renderHelp(registry);
  for (const cmd of ["help", "clear", "chat", "reset", "sessions", "model"]) {
    expect(help).toContain(cmd);
  }
  // `share` is hosted-only and not registered here, so it must not appear.
  expect(help).not.toContain("share");
  // Simulation grammar is documented separately.
  expect(help).toContain("/locate");
});

test("unknown input reaches the simulator even when it looks command-ish", () => {
  expect(parseInput("share", names())).toMatchObject({ kind: "simulation" });
  expect(parseInput("login me", names())).toMatchObject({ kind: "simulation" });
});

test("every provider has at least one preset and a resolvable default", () => {
  for (const provider of Object.keys(MODEL_PRESETS) as (keyof typeof MODEL_PRESETS)[]) {
    expect(MODEL_PRESETS[provider].length).toBeGreaterThan(0);
    expect(defaultModelFor(provider)).toBeTruthy();
  }
});

test("every preset id is valid for its own provider", () => {
  // Guards the mistake that shipped: an OpenRouter default of
  // "anthropic/claude-3.5-sonnet" (retired), and a Groq-style id being used
  // for OpenRouter.
  for (const provider of Object.keys(MODEL_PRESETS) as (keyof typeof MODEL_PRESETS)[]) {
    for (const preset of MODEL_PRESETS[provider]) {
      expect(checkModelId(provider, preset.id)).toEqual({ ok: true });
    }
  }
});

test("checkModelId catches cross-provider ids in both directions", () => {
  expect(checkModelId("openrouter", "yousim").ok).toBe(false);
  expect(checkModelId("openrouter", "llama-3.3-70b-versatile").ok).toBe(false);
  expect(checkModelId("groq", "meta-llama/llama-3.3-70b-instruct").ok).toBe(false);
  expect(checkModelId("openrouter", "meta-llama/llama-3.3-70b-instruct").ok).toBe(true);
});
