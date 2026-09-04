import fs from "fs";
import os from "os";
import path from "path";

/**
 * Config resolution for the CLI and local server.
 *
 * One resolver, so paths can't disagree the way three separate ones did.
 * Bun/Node only — the browser has no filesystem and no env.
 *
 * Precedence, highest first:
 *
 *   1. CLI flags                     (caller's business, not this module's)
 *   2. shell environment             real env only; see neutralizeCwdEnv
 *   3. ./.yousim.json                provider + model ONLY
 *   4. <home>/config.json
 *   5. <home>/.env
 *   6. built-in defaults
 *
 * `./.env` is deliberately absent. See neutralizeCwdEnv.
 */

export type ConfigSource =
  | "flag"
  | "env"
  | "project"   // ./.yousim.json
  | "user"      // <home>/config.json or <home>/.env
  | "default";

export interface ResolvedValue {
  value: string;
  source: ConfigSource;
  /** Where it came from, for `yousim config`. */
  origin?: string;
}

/** Config directory: YOUSIM_HOME > XDG_CONFIG_HOME/yousim > ~/.yousim */
export function configHome(): string {
  if (process.env.YOUSIM_HOME) return process.env.YOUSIM_HOME;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, "yousim");
  return path.join(os.homedir(), ".yousim");
}

/**
 * Data directory: YOUSIM_HOME > XDG_DATA_HOME/yousim > ~/.yousim
 *
 * Separate from config because XDG separates them, but both collapse to
 * ~/.yousim by default so there is one directory to back up or delete.
 */
export function dataHome(): string {
  if (process.env.YOUSIM_HOME) return process.env.YOUSIM_HOME;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "yousim");
  return path.join(os.homedir(), ".yousim");
}

/** Fields a project-local file is allowed to set. */
const PROJECT_ALLOWED = new Set(["provider", "model"]);

/**
 * Fields a project file must never set, called out separately so the warning
 * can explain *why* rather than just refusing.
 */
const PROJECT_FORBIDDEN: Record<string, string> = {
  apiKey: "credentials never come from project config",
  openaiApiKey: "credentials never come from project config",
  anthropicApiKey: "credentials never come from project config",
  openrouterApiKey: "credentials never come from project config",
  groqApiKey: "credentials never come from project config",
  baseURL: "an endpoint is a property of your machine, not of a repo",
  openaiBaseUrl: "an endpoint is a property of your machine, not of a repo",
};

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * The only variables neutralizeCwdEnv will touch: the ones this package
 * actually consults.
 *
 * The concern is a cwd .env redirecting OUR inference or supplying OUR
 * credentials. That is not a licence to scrub the environment. A .env in a
 * cloned repo is full of things that are none of our business — SUPABASE_URL,
 * JWT_SECRET, DATABASE_URL — and deleting those could break whatever else is
 * running in the same process or shell. Anything not listed here is left
 * exactly as found.
 */
export const CWD_ENV_KEYS = [
  "PROVIDER",
  "MODEL",
  "OPENROUTER_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_BASE_URL",
  "YOUSIM_DB",
  "YOUSIM_HOME",
  "YOUSIM_KEYCHAIN",
  "PORT",
  "VITE_API_URL",
];

/**
 * Undo Bun's automatic load of ./.env, for our own variables only.
 *
 * `.env` is an ambient project convention: it exists in countless repos for
 * reasons unrelated to this tool. Honoring it means `cd` into a cloned repo
 * and its .env can silently redirect inference — including OPENAI_BASE_URL —
 * with the user's credential attached. For a distributed CLI that is a
 * credential-disclosure vector, not a convenience.
 *
 * Bun loads it before main() runs, so opting out is active rather than
 * passive: read the file and drop any CWD_ENV_KEYS entry in process.env whose
 * value came from it. A shell variable that happens to hold the identical
 * value is indistinguishable, but then the behavior is identical too, so it
 * doesn't matter.
 *
 * Must run before anything reads process.env.
 */
export function neutralizeCwdEnv(cwd = process.cwd()): string[] {
  const dotenv = path.join(cwd, ".env");
  let content: string;
  try {
    content = fs.readFileSync(dotenv, "utf8");
  } catch {
    return [];
  }

  const parsed = parseEnvFile(content);
  const dropped: string[] = [];
  for (const key of CWD_ENV_KEYS) {
    if (key in parsed && process.env[key] === parsed[key]) {
      delete process.env[key];
      dropped.push(key);
    }
  }
  return dropped;
}

export interface ProjectConfig {
  provider?: string;
  model?: string;
}

export interface ProjectConfigResult {
  config: ProjectConfig;
  path?: string;
  /** Keys rejected, with the reason, so the CLI can explain rather than ignore. */
  rejected: { key: string; reason: string }[];
}

/** Read ./.yousim.json, keeping only fields a repo is trusted to set. */
export function loadProjectConfig(cwd = process.cwd()): ProjectConfigResult {
  const file = path.join(cwd, ".yousim.json");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (e: any) {
    // A malformed file is worth saying out loud; a missing one is normal.
    if (e?.code !== "ENOENT") {
      return { config: {}, path: file, rejected: [{ key: "(file)", reason: `unreadable: ${e.message}` }] };
    }
    return { config: {}, rejected: [] };
  }

  const config: ProjectConfig = {};
  const rejected: { key: string; reason: string }[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (PROJECT_ALLOWED.has(key) && typeof value === "string") {
      (config as any)[key] = value;
      continue;
    }
    const forbidden = PROJECT_FORBIDDEN[key];
    rejected.push({
      key,
      reason: forbidden ?? `not a recognized project setting`,
    });
  }

  return { config, path: file, rejected };
}

/** Read <home>/config.json and <home>/.env. User-level, so fully trusted. */
export function loadUserConfig(): { values: Record<string, string>; sources: Record<string, string> } {
  const home = configHome();
  const values: Record<string, string> = {};
  const sources: Record<string, string> = {};

  const envFile = path.join(home, ".env");
  try {
    for (const [k, v] of Object.entries(parseEnvFile(fs.readFileSync(envFile, "utf8")))) {
      values[k.toUpperCase()] = v;
      sources[k.toUpperCase()] = envFile;
    }
  } catch { /* absent is normal */ }

  // config.json wins over .env at the same level: it's the newer, structured form.
  const jsonFile = path.join(home, "config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v === null || v === undefined || typeof v === "object") continue;
      values[k.toUpperCase()] = String(v);
      sources[k.toUpperCase()] = jsonFile;
    }
  } catch { /* absent is normal */ }

  return { values, sources };
}
