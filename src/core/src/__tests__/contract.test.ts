import { expect, test } from "bun:test";
import {
  createModelInstance,
  resolveModel,
  resolveProvider,
  CONTRACT_VERSION,
  GaslitClaude,
  Simulator,
} from "../contract";
import { MemoryStorage } from "../storage/memory";

test("contract exposes a version", () => {
  expect(CONTRACT_VERSION).toBe("0.1.0");
});

test("per-call apiKey works without any env var", () => {
  // The BYOK case: browser has no process.env, credential arrives per call.
  const model = createModelInstance({
    provider: "openrouter",
    model: "test/model",
    apiKey: "sk-test-per-call",
  });
  expect(model).toBeDefined();
});

test("missing credential throws instead of silently using a placeholder", () => {
  // Regression: providers used to be built at module load with
  // `apiKey: "placeholder"`, so a missing key failed later as a confusing 401.
  const saved = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    expect(() => createModelInstance({ provider: "groq" })).toThrow(/No API key/);
  } finally {
    if (saved !== undefined) process.env.GROQ_API_KEY = saved;
  }
});

test("explicit config beats env", () => {
  const saved = process.env.MODEL;
  process.env.MODEL = "env-model";
  try {
    expect(resolveModel({ model: "explicit-model" })).toBe("explicit-model");
    expect(resolveModel({ provider: "openai" })).toBe("env-model");
  } finally {
    if (saved === undefined) delete process.env.MODEL;
    else process.env.MODEL = saved;
  }
});

test("baseURL override survives resolution (vLLM / gateway case)", () => {
  const model = createModelInstance({
    provider: "openai",
    model: "yousim",
    apiKey: "sk-local",
    baseURL: "http://localhost:9892/v1",
  });
  expect(model).toBeDefined();
});

test("provider falls back to anthropic", () => {
  const saved = process.env.PROVIDER;
  delete process.env.PROVIDER;
  try {
    expect(resolveProvider({})).toBe("anthropic");
  } finally {
    if (saved !== undefined) process.env.PROVIDER = saved;
  }
});

test("agents are constructible from the contract surface", () => {
  const searcher = new GaslitClaude({ name: "test", insights: "", history: [] });
  expect(searcher.getTemplate().length).toBeGreaterThan(0);
  const sim = new Simulator({ name: "test", history: [] });
  expect(sim.getSystemPrompt()).toContain("simulat");
});

test("storage round-trips a session with messages and a summary", async () => {
  const s = new MemoryStorage();
  const session = await s.createSession("u1", { name: "alice" });
  await s.insertMessage(session.id, "u1", "hello", true);
  await s.insertMessage(session.id, "u1", "world", false);
  await s.insertSummary(session.id, "u1", "a summary");

  const msgs = await s.getMessages(session.id, "u1");
  expect(msgs.map((m) => m.content)).toEqual(["hello", "world"]);
  expect(msgs[0].is_user).toBe(true);
  expect(msgs[1].is_user).toBe(false);

  const latest = await s.getLatestSummary(session.id, "u1");
  expect(latest?.content).toBe("a summary");

  expect(await s.getMessages(session.id, "other-user")).toHaveLength(0);
});
