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

/**
 * Platform modules the stable surface must never reach, at any depth.
 *
 * The `node:` and bare forms of the same module are both listed because both
 * appear in this tree, and `bun:` covers bun:sqlite.
 *
 * `node:sqlite` is listed alongside it because the SQLite binding is now
 * chosen by a conditional `exports` entry rather than by a literal import:
 * `bun:sqlite` under Bun, `node:sqlite` under Node and everywhere else. A
 * regex that knows only about `bun:sqlite` would let the store reach the
 * contract through the Node branch and report nothing — which is precisely
 * the kind of silent pass this whole test exists to prevent.
 */
const BANNED = /^(bun:|node:(fs|os|path|child_process|sqlite))|^(fs|os|path|child_process)$/;

/**
 * Bundle an entry for the browser and report every banned module the
 * BUNDLER's own resolver walked into, with the file that imported it.
 *
 * This replaces a regex that scanned for `from "..."` matches. That regex
 * missed single-quoted specifiers, `import()`, `export ... from`, aliased
 * imports and subpath exports — and, being a hand-rolled walk, it silently
 * passed on any file it failed to find, which means a walk that resolved
 * nothing at all still reported success. Asking the bundler removes all of
 * that: if a module is in the graph, the resolver sees it, whatever syntax
 * pulled it in.
 *
 * A plugin rather than `build.success`: `target: "browser"` does not fail on a
 * Node builtin, it quietly substitutes a shim. So the build succeeds and the
 * literal string is gone from the output — which is exactly how a naive
 * version of this test passes while the contract is broken. The trap catches
 * the resolution itself.
 */
interface BundleResult {
  /** Banned modules the resolver walked into, each with its importer. */
  banned: string[];
  /** Bundled output, so a test can check the build produced something real. */
  code: string;
  errors: string[];
  success: boolean;
}

/**
 * Memoized: one build per entry, for the whole file.
 *
 * Not just for speed. Repeating `Bun.build` on the same graph inside a single
 * `bun test` process makes later builds fail with "Unexpected reading file"
 * on a dependency that is plainly on disk — a Bun issue, not a real result.
 * One build per entry keeps that out of the way, and the assertions all read
 * from the same result anyway.
 */
const bundles = new Map<string, Promise<BundleResult>>();

function bundle(entry: string): Promise<BundleResult> {
  const cached = bundles.get(entry);
  if (cached) return cached;

  const promise = (async (): Promise<BundleResult> => {
    const { join, dirname } = await import("node:path");
    const root = dirname(import.meta.dir); // src/core/src
    const banned: string[] = [];

    const build = await Bun.build({
      entrypoints: [join(root, entry)],
      target: "browser",
      throw: false,
      plugins: [
        {
          name: "ban-platform-modules",
          setup(b) {
            b.onResolve({ filter: BANNED }, (args) => {
              banned.push(`${args.path} <- ${args.importer.replace(root + "/", "")}`);
              // Marked external so the build completes and reports EVERY
              // offender rather than stopping at the first.
              return { path: args.path, external: true };
            });
          },
        },
      ],
    });

    return {
      banned,
      code: build.success && build.outputs[0] ? await build.outputs[0].text() : "",
      errors: build.logs.filter((l) => l.level === "error").map((l) => String(l.message)),
      success: build.success,
    };
  })();

  bundles.set(entry, promise);
  return promise;
}

test("contract reaches no platform-only module, at any depth", async () => {
  // The stable surface has to be importable from a browser and an edge
  // runtime, neither of which has bun:sqlite, fs, os or path.
  const { banned, errors, success } = await bundle("contract.ts");
  expect(errors).toEqual([]);
  expect(success).toBe(true);
  expect(banned).toEqual([]);
});

test("contract bundles to something real, not an empty module", async () => {
  // Guards the test above from passing vacuously: an entry that resolves to
  // nothing also reaches no banned module.
  const { code } = await bundle("contract.ts");
  expect(code).toContain("CONTRACT_VERSION");
  expect(code).toContain("GaslitClaude");
  expect(code.length).toBeGreaterThan(5_000);
});

test("the index barrel DOES reach platform modules, which is why contract.ts exists", async () => {
  // The control. The barrel exports the stores and the stores reach a SQLite
  // binding and fs, so this must come back non-empty. If it ever comes back
  // clean, the trap has stopped working and the test above proves nothing.
  const { banned } = await bundle("index.ts");

  // Whichever binding the bundler's own conditions selected. Asserted as
  // "either" rather than pinned to one: the point of the control is that a
  // SQLite module is reached at all, and pinning it would make this test fail
  // the day Bun's browser target starts preferring a different condition —
  // which would say nothing about the contract.
  expect(banned.some((h) => /^(bun|node):sqlite\b/.test(h))).toBe(true);

  // And it is reached through the driver, not by a literal import in the
  // store. This is the shape of the indirection, pinned: if someone
  // "simplifies" storage/sqlite.ts back to importing a binding directly, the
  // per-runtime selection is gone and this is what notices.
  expect(banned.some((h) => /^(bun|node):sqlite <- storage\/driver\.(bun|node)\.ts$/.test(h))).toBe(
    true
  );

  // fs, still imported directly by the store itself.
  expect(banned.some((h) => h.includes("storage/sqlite.ts"))).toBe(true);
});

test("the OpenRouter default has a valid id shape", async () => {
  // OpenRouter ids are namespaced "vendor/model". A bare name is either a
  // different provider's id or a retired one, and either way it 404s at
  // request time — which reads as "YouSim is broken", not "bad config".
  const { resolveModel } = await import("../model");
  const saved = { m: process.env.MODEL, om: process.env.OPENROUTER_MODEL };
  delete process.env.MODEL;
  delete process.env.OPENROUTER_MODEL;
  try {
    expect(resolveModel({ provider: "openrouter" })).toContain("/");
  } finally {
    if (saved.m !== undefined) process.env.MODEL = saved.m;
    if (saved.om !== undefined) process.env.OPENROUTER_MODEL = saved.om;
  }
});
