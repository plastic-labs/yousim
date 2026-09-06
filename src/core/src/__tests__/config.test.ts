import { expect, test, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  CWD_ENV_KEYS,
  configHome,
  dataHome,
  loadProjectConfig,
  loadUserConfig,
  neutralizeCwdEnv,
} from "../config";

// The keychain guard is set by scripts/hermetic.ts, in the environment before
// Bun starts. Setting it here would already be too late: static imports have
// run by the time this line does.

const HOME_VARS = ["YOUSIM_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"] as const;
const saved = new Map<string, string | undefined>();
const dirs: string[] = [];

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "yousim-config-"));
  dirs.push(d);
  return d;
}

function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  value === undefined ? delete process.env[key] : (process.env[key] = value);
}

afterEach(() => {
  for (const [k, v] of saved) v === undefined ? delete process.env[k] : (process.env[k] = v);
  saved.clear();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ─── neutralizeCwdEnv ──────────────────────────────────────────────────────

test("a var whose value came from ./.env is dropped", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, ".env"), "OPENAI_BASE_URL=http://evil.example/v1/\nPROVIDER=openai\n");
  setEnv("OPENAI_BASE_URL", "http://evil.example/v1/");
  setEnv("PROVIDER", "openai");

  expect(neutralizeCwdEnv(cwd).sort()).toEqual(["OPENAI_BASE_URL", "PROVIDER"]);
  expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  expect(process.env.PROVIDER).toBeUndefined();
});

test("only variables this package reads are dropped; the rest are none of our business", () => {
  // The regression that matters. A cloned repo's .env is full of other tools'
  // settings; deleting those could break whatever else shares this process.
  const cwd = scratch();
  writeFileSync(
    join(cwd, ".env"),
    "PROVIDER=openai\nSUPABASE_URL=x\nDATABASE_URL=y\nJWT_SECRET=z\n"
  );
  setEnv("PROVIDER", "openai");
  setEnv("SUPABASE_URL", "x");
  setEnv("DATABASE_URL", "y");
  setEnv("JWT_SECRET", "z");

  expect(neutralizeCwdEnv(cwd)).toEqual(["PROVIDER"]);
  expect(process.env.SUPABASE_URL).toBe("x");
  expect(process.env.DATABASE_URL).toBe("y");
  expect(process.env.JWT_SECRET).toBe("z");
});

test("the allowlist covers every key the config layers resolve", () => {
  // A key readable from config but absent here would still be settable by a
  // cwd .env, which is the whole hole this closes.
  for (const key of ["PROVIDER", "MODEL", "OPENAI_BASE_URL", "YOUSIM_DB", "PORT"]) {
    expect(CWD_ENV_KEYS).toContain(key);
  }
  expect(CWD_ENV_KEYS).not.toContain("SUPABASE_URL");
});

test("a shell var the file does not mention is left alone", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, ".env"), "PROVIDER=openai\n");
  setEnv("PROVIDER", "openai");
  setEnv("ANTHROPIC_API_KEY", "from-the-shell");

  expect(neutralizeCwdEnv(cwd)).toEqual(["PROVIDER"]);
  expect(process.env.ANTHROPIC_API_KEY).toBe("from-the-shell");
});

test("a shell var that merely shares a name with a .env key survives", () => {
  // Only an exact value match is attributable to the file. A shell export that
  // disagrees with .env was not loaded from it, so it stays.
  const cwd = scratch();
  writeFileSync(join(cwd, ".env"), "PROVIDER=openai\n");
  setEnv("PROVIDER", "anthropic");

  expect(neutralizeCwdEnv(cwd)).toEqual([]);
  expect(process.env.PROVIDER).toBe("anthropic");
});

test("no ./.env is not an error", () => {
  expect(neutralizeCwdEnv(scratch())).toEqual([]);
});

// ─── loadProjectConfig ─────────────────────────────────────────────────────

test("a project file may set provider and model", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, ".yousim.json"), JSON.stringify({ provider: "groq", model: "x/y" }));

  const result = loadProjectConfig(cwd);
  expect(result.config).toEqual({ provider: "groq", model: "x/y" });
  expect(result.rejected).toEqual([]);
});

test("a project file may not set a credential or an endpoint, and says why", () => {
  const cwd = scratch();
  writeFileSync(
    join(cwd, ".yousim.json"),
    JSON.stringify({ provider: "openai", apiKey: "sk-nope", baseURL: "http://evil.example/v1/" })
  );

  const result = loadProjectConfig(cwd);
  expect(result.config).toEqual({ provider: "openai" });

  const rejected = Object.fromEntries(result.rejected.map((r) => [r.key, r.reason]));
  expect(Object.keys(rejected).sort()).toEqual(["apiKey", "baseURL"]);
  // The reason has to be reportable, not just a boolean refusal.
  expect(rejected.apiKey).toContain("credentials");
  expect(rejected.baseURL).toContain("endpoint");
});

test("an unknown key is rejected rather than silently ignored", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, ".yousim.json"), JSON.stringify({ wat: 1 }));
  expect(loadProjectConfig(cwd).rejected).toEqual([
    { key: "wat", reason: "not a recognized project setting" },
  ]);
});

test("a malformed project file is reported; a missing one is not", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, ".yousim.json"), "{ not json");
  expect(loadProjectConfig(cwd).rejected[0]?.key).toBe("(file)");
  expect(loadProjectConfig(scratch()).rejected).toEqual([]);
});

// ─── configHome / dataHome ─────────────────────────────────────────────────

test("YOUSIM_HOME beats XDG, which beats ~/.yousim", () => {
  for (const v of HOME_VARS) setEnv(v, undefined);
  expect(configHome()).toBe(join(homedir(), ".yousim"));
  expect(dataHome()).toBe(join(homedir(), ".yousim"));

  setEnv("XDG_CONFIG_HOME", "/xdg/config");
  setEnv("XDG_DATA_HOME", "/xdg/data");
  expect(configHome()).toBe(join("/xdg/config", "yousim"));
  expect(dataHome()).toBe(join("/xdg/data", "yousim"));

  setEnv("YOUSIM_HOME", "/explicit");
  expect(configHome()).toBe("/explicit");
  expect(dataHome()).toBe("/explicit");
});

test("config and data split only when XDG splits them", () => {
  for (const v of HOME_VARS) setEnv(v, undefined);
  setEnv("XDG_DATA_HOME", "/xdg/data");
  // One directory to back up or delete unless the user asked otherwise.
  expect(configHome()).toBe(join(homedir(), ".yousim"));
  expect(dataHome()).toBe(join("/xdg/data", "yousim"));
});

// ─── loadUserConfig ────────────────────────────────────────────────────────

test("config.json wins over .env at the same level, and origins are reported", () => {
  const home = scratch();
  setEnv("YOUSIM_HOME", home);
  writeFileSync(join(home, ".env"), "PROVIDER=groq\nMODEL=from-env-file\n");
  writeFileSync(join(home, "config.json"), JSON.stringify({ provider: "openrouter" }));

  const { values, sources } = loadUserConfig();
  expect(values.PROVIDER).toBe("openrouter");
  expect(values.MODEL).toBe("from-env-file");
  expect(sources.PROVIDER).toBe(join(home, "config.json"));
  expect(sources.MODEL).toBe(join(home, ".env"));
});

test("an absent user config is empty, not an error", () => {
  setEnv("YOUSIM_HOME", scratch());
  expect(loadUserConfig().values).toEqual({});
});

test("every autoloaded env file is neutralized, not just .env", () => {
  // A security audit found .env.local sailing straight through: the guard
  // parsed one filename while Bun autoloads several. OPENAI_BASE_URL from
  // .env.local was live, which is a credential-redirect vector.
  const dir = mkdtempSync(join(tmpdir(), "yousim-env-"));
  try {
    writeFileSync(join(dir, ".env"), "MODEL=from-dotenv\n");
    writeFileSync(join(dir, ".env.local"), "OPENAI_BASE_URL=http://evil.example/v1/\n");
    process.env.MODEL = "from-dotenv";
    process.env.OPENAI_BASE_URL = "http://evil.example/v1/";

    const dropped = neutralizeCwdEnv(dir);

    expect(dropped).toContain("MODEL");
    expect(dropped).toContain("OPENAI_BASE_URL");
    expect(process.env.MODEL).toBeUndefined();
    expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MODEL;
    delete process.env.OPENAI_BASE_URL;
  }
});

// The test that used to live here grepped these two entrypoints for
// "--no-env-file" and "--config=/dev/null". That asserts the flags are
// written down, which is not the claim anyone cares about — the claim is that
// running the published command from a hostile directory is safe, and between
// the flags and that outcome sits the bundler, the npm bin shim, and whether
// the platform has `env -S` at all. It now lives in
// src/launcher/src/__tests__/hostile-dir.test.ts, which builds a malicious
// directory and launches the real installed binary out of it.

// ─── neutralizeCwdEnv vs Bun's actual precedence ───────────────────────────
//
// KNOWN FAILING. A real bug, left unfixed deliberately: the work this landed
// under was the test gate, not the fix.
//
// neutralizeCwdEnv attributes a variable to a cwd .env file by comparing
// process.env against its own merge of those files. That comparison is only
// sound if its merge order matches Bun's, and it does not:
//
//   * Bun skips .env.local entirely when NODE_ENV=test (the Vite/Next
//     convention). The guard always merges it.
//   * Bun ranks .env.local ABOVE .env.<NODE_ENV>. The guard's Object.assign
//     runs .env -> .env.local -> .env.<NODE_ENV>, so the reverse.
//
// Either disagreement makes the guard compute the wrong value for a key that
// appears in two files, see a mismatch, and conclude the live value came from
// the shell — so it leaves the hostile variable in place. OPENAI_BASE_URL is
// the one that matters: it decides which host receives the user's key.
//
// The existing "every autoloaded env file is neutralized" test above misses
// this because it puts a different key in each file, so no two files ever
// disagree about one variable.
//
// This is the documented BACKSTOP for platforms where the shebang flags do
// not apply, which is to say Windows. There, this is live.

test("a key in both .env and .env.local is dropped under NODE_ENV=test", () => {
  const cwd = scratch();
  writeFileSync(cwd + "/.env", "OPENAI_BASE_URL=http://evil.example/v1\n");
  writeFileSync(cwd + "/.env.local", "OPENAI_BASE_URL=http://evil.example/v1/local\n");

  // What Bun actually leaves in process.env with NODE_ENV=test: .env wins,
  // because .env.local is not read at all.
  setEnv("NODE_ENV", "test");
  setEnv("OPENAI_BASE_URL", "http://evil.example/v1");

  expect(neutralizeCwdEnv(cwd)).toContain("OPENAI_BASE_URL");
  expect(process.env.OPENAI_BASE_URL).toBeUndefined();
});

test("a key in both .env.local and .env.<NODE_ENV> is dropped", () => {
  const cwd = scratch();
  writeFileSync(cwd + "/.env.local", "OPENAI_BASE_URL=http://evil.example/v1/local\n");
  writeFileSync(cwd + "/.env.production", "OPENAI_BASE_URL=http://evil.example/v1/prod\n");

  // Bun ranks .env.local higher, so this is the value that is actually live.
  setEnv("NODE_ENV", "production");
  setEnv("OPENAI_BASE_URL", "http://evil.example/v1/local");

  expect(neutralizeCwdEnv(cwd)).toContain("OPENAI_BASE_URL");
  expect(process.env.OPENAI_BASE_URL).toBeUndefined();
});
