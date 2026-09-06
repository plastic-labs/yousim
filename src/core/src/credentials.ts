import fs from "fs";
import path from "path";
import { spawnSync } from "node:child_process";
import { configHome } from "./config";
import type { Provider } from "./model";

/**
 * Where a locally-connected API key lives.
 *
 * Keychain first on macOS, falling back to a 0600 file — the pattern Claude
 * Code and most credential-holding CLIs use. The file fallback matters: it is
 * what keeps headless machines, containers and CI working.
 *
 * Deliberately not config.json. Config gets pasted into issues and committed
 * to dotfile repos; a credential should not travel with it.
 *
 * Node/Bun only. The browser keeps its key in localStorage and never writes
 * anywhere we control.
 */

const SERVICE = "yousim";

export function credentialsPath(): string {
  return path.join(configHome(), "credentials.json");
}

type Store = Record<string, { key: string; connected_at: string }>;

// ─── Keychain (macOS) ──────────────────────────────────────────────────────

/**
 * The keychain is machine-global: unlike the file store it cannot be isolated
 * by pointing YOUSIM_HOME somewhere else. Tests and any other run that must
 * not touch real credentials set YOUSIM_KEYCHAIN=0.
 *
 * This is not a hypothetical — the credential tests overwrote a real connected
 * key in the login keychain the first time this shipped without the guard.
 */
function keychainAvailable(): boolean {
  if (process.env.YOUSIM_KEYCHAIN === "0") return false;
  // Platform only. There used to be a `typeof Bun !== "undefined"` here as
  // well, from when Bun was the only runtime and `Bun.spawnSync` was the only
  // way to reach `security`. It has to go rather than be inverted: keeping it
  // would silently drop every Node user to the file store on a Mac that has a
  // perfectly good keychain, and the calls below are `node:child_process` now,
  // which both runtimes implement.
  return process.platform === "darwin";
}

function keychainGet(provider: string): string | undefined {
  if (!keychainAvailable()) return undefined;
  try {
    const p = spawnSync("security", [
      "find-generic-password",
      "-s", `${SERVICE}-${provider}`, "-a", provider, "-w",
    ]);
    // `status` is null when the child was killed or never started at all
    // (`security` absent, spawn refused), and node reports that through
    // `p.error` rather than by throwing. `!== 0` covers every one of those.
    if (p.status !== 0) return undefined;
    const out = p.stdout.toString().trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a key survives `security -i` quoting.
 *
 * `-i` tokenizes each line it reads and round-trips neither `"` nor `\`: it
 * stores a silently truncated value instead of failing. No provider issues keys
 * containing either, but writing the wrong credential without saying so is not
 * a failure mode worth risking on a value we do not control.
 */
function keychainQuotable(key: string): boolean {
  return !/["\\\r\n]/.test(key);
}

function keychainSet(provider: string, key: string): boolean {
  if (!keychainAvailable()) return false;
  // -U updates in place rather than erroring when an entry already exists.
  const args = ["-U", "-s", `${SERVICE}-${provider}`, "-a", provider];
  try {
    // `security -i` reads whole commands from stdin, which keeps the key out of
    // argv — `-w <key>` exposes it to anything that can read this process's
    // arguments for the duration of the call.
    if (keychainQuotable(key)) {
      const p = spawnSync("security", ["-i"], {
        input: `add-generic-password ${args.join(" ")} -w "${key}"\n`,
      });
      return p.status === 0;
    }
    const p = spawnSync("security", ["add-generic-password", ...args, "-w", key]);
    return p.status === 0;
  } catch {
    return false;
  }
}

function keychainDelete(provider: string): void {
  if (!keychainAvailable()) return;
  try {
    spawnSync("security", [
      "delete-generic-password",
      "-s", `${SERVICE}-${provider}`, "-a", provider,
    ]);
  } catch { /* absent is fine */ }
}

/** Where a new credential would be written. Reported by `yousim config`. */
export function credentialBackend(): "keychain" | "file" {
  return keychainAvailable() ? "keychain" : "file";
}

// ─── File fallback ─────────────────────────────────────────────────────────

function readFileStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeFileStore(store: Store) {
  const dir = configHome();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = credentialsPath();
  // Write with the mode set, then chmod, so it is never briefly world-readable.
  fs.writeFileSync(p, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.chmodSync(p, 0o600);
}

// ─── Public API ────────────────────────────────────────────────────────────

export function saveCredential(provider: string, key: string): "keychain" | "file" {
  const store = readFileStore();

  if (keychainSet(provider, key)) {
    // Record that it exists without storing the secret twice.
    store[provider] = { key: "", connected_at: new Date().toISOString() };
    writeFileStore(store);
    return "keychain";
  }

  store[provider] = { key, connected_at: new Date().toISOString() };
  writeFileStore(store);
  return "file";
}

/**
 * An explicit env var wins, so CI and one-off overrides keep working without
 * having to disconnect a stored key.
 */
export function loadCredential(provider: string, envVar?: string): string | undefined {
  if (envVar && process.env[envVar]) return process.env[envVar];
  const fromKeychain = keychainGet(provider);
  if (fromKeychain) return fromKeychain;
  const stored = readFileStore()[provider]?.key;
  return stored || undefined;
}

export function forgetCredential(provider: string) {
  keychainDelete(provider);
  const store = readFileStore();
  delete store[provider];
  writeFileStore(store);
}

/**
 * The provider of the connected account, if there is one.
 *
 * `yousim connect` followed by `yousim` has to work with no env var set, so
 * this is consulted before the built-in default provider. It lives here rather
 * than in the CLI so that `yousim config` reports the same provider the CLI
 * will actually use — two copies of this rule is how config output starts
 * lying.
 */
export function connectedProvider(): Provider | undefined {
  return listCredentials()[0]?.provider as Provider | undefined;
}

export function listCredentials(): { provider: string; connected_at: string; storage: "keychain" | "file" }[] {
  const store = readFileStore();
  return Object.entries(store).map(([provider, v]) => ({
    provider,
    connected_at: v.connected_at,
    storage: v.key ? "file" : "keychain",
  }));
}
