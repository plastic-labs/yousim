import fs from "fs";
import os from "os";
import path from "path";

/**
 * Where a locally-connected API key is kept.
 *
 * Deliberately a separate 0600 file rather than config.json: config is the
 * kind of thing people paste into issues and commit to dotfile repos, and a
 * credential should not travel with it.
 *
 * Bun/Node only — the browser keeps its key in localStorage instead, and never
 * writes it anywhere we control.
 */

function credentialsDir(): string {
  if (process.env.YOUSIM_HOME) return process.env.YOUSIM_HOME;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "yousim");
  return path.join(os.homedir(), ".yousim");
}

function credentialsPath(): string {
  return path.join(credentialsDir(), "credentials.json");
}

type Store = Record<string, { key: string; connected_at: string }>;

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), "utf8")) as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  const dir = credentialsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Write then chmod, so the file is never briefly world-readable.
  const p = credentialsPath();
  fs.writeFileSync(p, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.chmodSync(p, 0o600);
}

export function saveCredential(provider: string, key: string) {
  const store = read();
  store[provider] = { key, connected_at: new Date().toISOString() };
  write(store);
}

/**
 * An explicit env var wins, so CI and one-off overrides keep working without
 * having to disconnect a stored key.
 */
export function loadCredential(provider: string, envVar?: string): string | undefined {
  if (envVar && process.env[envVar]) return process.env[envVar];
  return read()[provider]?.key;
}

export function forgetCredential(provider: string) {
  const store = read();
  delete store[provider];
  write(store);
}

export function listCredentials(): { provider: string; connected_at: string }[] {
  return Object.entries(read()).map(([provider, v]) => ({
    provider,
    connected_at: v.connected_at,
  }));
}

export { credentialsPath };
