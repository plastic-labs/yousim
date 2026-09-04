import fs from "fs";
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
  "HOST",
];

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
  };
}
