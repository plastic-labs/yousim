import fs from "fs";
import os from "os";
import path from "path";
import { configHome, dataHome, loadProjectConfig, loadUserConfig } from "@yousim/core/config";
import type { ConfigSource } from "@yousim/core/config";

/**
 * Launcher-side config resolution.
 *
 * The parsing and the path rules live in @yousim/core/config so the CLI, the
 * server and this launcher cannot disagree about where anything is. What is
 * left here is the launcher's own job: decide which layer wins, push the
 * winner into process.env for the code downstream that still reads env, and
 * keep a record of *why* each value won so `yousim config` can show it.
 *
 * Note what is absent: ./.env. See neutralizeCwdEnv in core.
 */

export interface Setting {
  key: string;
  value: string;
  source: ConfigSource;
  /** The file it came from, when it came from one. */
  origin?: string;
}

export interface Resolution {
  configDir: string;
  dataDir: string;
  settings: Setting[];
  /** Something was wrong and the user needs to know — a rejected project key. */
  warnings: string[];
  /** Something happened silently that shouldn't be silent — a migration. */
  notices: string[];
}

/**
 * The keys the launcher resolves from the config layers. Anything else in env
 * is passed through untouched. Exported because it is also the display order
 * for `yousim config`.
 *
 * Deliberately a subset of core's CWD_ENV_KEYS, which is the wider set this
 * package *reads*. YOUSIM_HOME and YOUSIM_KEYCHAIN are env-only: they decide
 * where the config files live, so honoring them from inside one would be
 * circular. Adding a key here means checking that list too.
 */
export const KEYS = [
  "PROVIDER",
  "MODEL",
  "OPENROUTER_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_BASE_URL",
  "YOUSIM_DB",
  "PORT",
];

/**
 * Files that used to live in ~/.yousim unconditionally.
 *
 * Setting XDG_CONFIG_HOME or YOUSIM_HOME moves the resolved directory, which
 * would otherwise orphan an existing install: the key is still on disk, the
 * sessions are still on disk, and the tool acts like a fresh checkout. Move
 * them instead, and never over the top of anything already at the destination.
 */
const LEGACY_LAYOUT: [name: string, dir: () => string][] = [
  ["credentials.json", configHome],
  ["config.json", configHome],
  [".env", configHome],
  ["yousim.db", dataHome],
  ["yousim.db-wal", dataHome],
  ["yousim.db-shm", dataHome],
];

function migrateLegacyHome(): string[] {
  const legacy = path.join(os.homedir(), ".yousim");
  if (!fs.existsSync(legacy)) return [];

  const moved: string[] = [];
  const conflicts: string[] = [];
  for (const [name, resolveDir] of LEGACY_LAYOUT) {
    const destDir = resolveDir();
    if (path.resolve(destDir) === path.resolve(legacy)) continue;

    const from = path.join(legacy, name);
    const to = path.join(destDir, name);
    if (!fs.existsSync(from)) continue;
    // An existing destination file wins: it is the newer install, and losing
    // it to a stale copy would be worse than leaving the stale copy behind.
    if (fs.existsSync(to)) {
      conflicts.push(`kept ${to}; left ${from} in place`);
      continue;
    }

    fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
    try {
      fs.renameSync(from, to);
    } catch {
      // EXDEV: the destination is on another filesystem, so rename can't work.
      fs.copyFileSync(from, to);
      fs.unlinkSync(from);
    }
    if (name === "credentials.json") fs.chmodSync(to, 0o600);
    moved.push(`moved ${from} -> ${to}`);
  }

  // A blocked file is only worth mentioning as part of a migration that is
  // otherwise happening — a leftover with no explanation is how someone spends
  // an hour wondering which copy is live. Once nothing is moving, the blocked
  // file is just a file, and repeating the warning on every single invocation
  // for the rest of time teaches people to ignore our output.
  return moved.length > 0 ? [...moved, ...conflicts] : [];
}

function claim(
  settings: Map<string, Setting>,
  key: string,
  value: string | undefined,
  source: ConfigSource,
  origin?: string
) {
  // First writer wins, so callers apply layers highest-precedence first.
  if (!value || settings.has(key)) return;
  settings.set(key, { key, value, source, origin });
}

/**
 * Resolve every layer, apply the result to process.env, and report it.
 *
 * Precedence, highest first: flags, real shell env, ./.yousim.json,
 * <config dir>/config.json, <config dir>/.env.
 */
export function resolveConfig(flags: Record<string, string> = {}): Resolution {
  const notices = migrateLegacyHome();
  const warnings: string[] = [];
  const settings = new Map<string, Setting>();

  for (const [key, value] of Object.entries(flags)) {
    claim(settings, key, value, "flag");
  }

  // Anything already in process.env was put there by the real shell — ./.env
  // was dropped before this ran — so nothing below may override it.
  for (const key of KEYS) {
    claim(settings, key, process.env[key], "env");
  }

  // A repo may pick the provider and the model. It may not supply a credential
  // or an endpoint, and when it tries, that is said out loud rather than
  // dropped: a silently ignored setting looks like a bug in the tool.
  const project = loadProjectConfig();
  for (const { key, reason } of project.rejected) {
    warnings.push(`${project.path}: ignoring "${key}" — ${reason}`);
  }
  claim(settings, "PROVIDER", project.config.provider, "project", project.path);
  claim(settings, "MODEL", project.config.model, "project", project.path);

  const user = loadUserConfig();
  for (const key of KEYS) {
    claim(settings, key, user.values[key], "user", user.sources[key]);
  }

  // core/model and the API server still read process.env, so the winners have
  // to land there for any of this to take effect.
  for (const s of settings.values()) process.env[s.key] = s.value;

  return {
    configDir: configHome(),
    dataDir: dataHome(),
    settings: KEYS.map((k) => settings.get(k)).filter((s): s is Setting => Boolean(s)),
    warnings,
    notices,
  };
}
