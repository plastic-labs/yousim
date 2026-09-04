/**
 * `yousim config` must not move anything.
 *
 * It used to. `resolveConfig()` called a migration that renamed
 * ~/.yousim/{credentials.json,config.json,.env,yousim.db} into the *resolved*
 * config and data directories on every single launch. So
 * `YOUSIM_HOME=/tmp/x yousim config` — a command whose entire job is to print
 * where values came from — relocated the user's live credential into /tmp.
 * Setting XDG_CONFIG_HOME was enough to trigger it on Linux. It was hit for
 * real during the DEV-2629 work, and only a sandbox write denial prevented the
 * loss.
 *
 * The migration is gone: nothing has ever been published under an older
 * layout, so there is no install to migrate, and the code was pure downside.
 * This asserts it stays gone. The failure mode is silent and the cost is a
 * credential, which is the combination that earns a test for deleted code.
 */

import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const LAUNCHER = join(import.meta.dir, "..", "index.ts");

const dirs: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "yousim-readonly-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Run against a HOME of our own, never the real one. The bug this guards
 * against is precisely "a command reached into $HOME and moved a file", so the
 * test must not be the thing that does it.
 */
function runConfig(home: string, extra: Record<string, string>) {
  return Bun.spawnSync([process.execPath, "--no-env-file", LAUNCHER, "config"], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      YOUSIM_KEYCHAIN: "0",
      ...extra,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

test("`config` leaves an existing ~/.yousim where it is", () => {
  const home = scratch();
  const elsewhere = scratch();
  const legacy = join(home, ".yousim");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "credentials.json"), '{"openrouter":{"key":"sk-or-v1-fixture"}}');
  writeFileSync(join(legacy, "yousim.db"), "not a real database");

  const p = runConfig(home, { YOUSIM_HOME: elsewhere });
  expect(p.exitCode).toBe(0);

  // Still in place, still intact.
  expect(existsSync(join(legacy, "credentials.json"))).toBe(true);
  expect(readFileSync(join(legacy, "credentials.json"), "utf8")).toContain("sk-or-v1-fixture");
  expect(existsSync(join(legacy, "yousim.db"))).toBe(true);

  // And nothing was deposited in the redirected home.
  expect(existsSync(join(elsewhere, "credentials.json"))).toBe(false);
  expect(existsSync(join(elsewhere, "yousim.db"))).toBe(false);
});

test("`config` leaves an existing ~/.yousim alone under XDG_CONFIG_HOME too", () => {
  const home = scratch();
  const xdg = scratch();
  const legacy = join(home, ".yousim");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "credentials.json"), '{"openrouter":{"key":"sk-or-v1-fixture"}}');

  const p = runConfig(home, { XDG_CONFIG_HOME: xdg });
  expect(p.exitCode).toBe(0);

  expect(readFileSync(join(legacy, "credentials.json"), "utf8")).toContain("sk-or-v1-fixture");
  expect(existsSync(join(xdg, "yousim", "credentials.json"))).toBe(false);
});
