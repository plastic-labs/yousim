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

// Nothing here touches credentials, but the keychain is machine-global and a
// stray write lands in the developer's real login keychain. Cheap insurance.
process.env.YOUSIM_KEYCHAIN = "0";

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
