/**
 * The hermetic test environment.
 *
 * The 59 unit tests prove the code works. They do not prove the published
 * package is safe on a stranger's machine, and the difference showed up as
 * real damage: an early credential test overwrote a live key in the
 * developer's login keychain, because the macOS Keychain is machine-global
 * and cannot be redirected with YOUSIM_HOME the way the file store can.
 *
 * So the guard lives here, in the parent process, and is applied to the child
 * env before Bun starts. `credentials.test.ts` sets YOUSIM_KEYCHAIN=0 at the
 * top of the file, which is already too late: static imports have run by
 * then, and the day any module gains a load-time side effect that reads a
 * credential, that line stops helping. An env var set before the runtime
 * exists cannot be outrun.
 *
 * Everything a test could persist to is pointed at a temp directory that dies
 * with the run, and every real provider credential is stripped from the child.
 * A test that wants a credential has to make one up.
 *
 * Usage:
 *   bun run scripts/hermetic.ts [--coverage] [extra bun test args...]
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { CWD_ENV_KEYS } from "@yousim/core/config";

export const REPO_ROOT = join(import.meta.dir, "..");

/**
 * Per-module line-coverage floors.
 *
 * Deliberately not a repo-wide number. A single global threshold is a number
 * you satisfy by testing whatever is easiest, and `agents.ts` is 380 lines of
 * prompt text that a percentage cannot say anything useful about. These four
 * are the modules where a regression is a security regression: where the
 * config comes from, where the key is stored, how the OAuth exchange is
 * proved, and what is written to disk.
 *
 * These are floors at the level already achieved, not aspirations. Raise them
 * when coverage improves. Lowering one is a decision that belongs in a commit
 * message, not in a config file nobody reads.
 */
const COVERAGE_FLOORS: Record<string, number> = {
  // Full paths from the repo root, matched exactly. A suffix match would be
  // ambiguous: `src/launcher/src/config.ts` also ends with "src/config.ts",
  // so a floor meant for core's config resolver could silently be checked
  // against a different file entirely.
  "src/core/src/config.ts": 95,
  "src/core/src/credentials.ts": 55,
  "src/core/src/pkce.ts": 85,
  "src/core/src/storage/sqlite.ts": 80,
  "src/core/src/storage/memory.ts": 50,
};

/**
 * Provider credentials and endpoint overrides, stripped from the child.
 *
 * CWD_ENV_KEYS is reused rather than restated: it is already the list of
 * variables this package consults, maintained for the cwd-.env guard. A key
 * that gets added there is a key that must be scrubbed here, and one list
 * cannot drift from itself.
 *
 * Stripping them is what makes the suite runnable by anyone, on any machine,
 * with no account: no test can make a live model call because no test can find
 * a credential to make one with. That is a property, not a convenience — a
 * suite that quietly spends the runner's credit when a key happens to be
 * exported is a suite nobody can trust to be free.
 *
 * A test that genuinely needs a live credential belongs behind
 * `bun run scripts/hermetic.ts --live`, which leaves the environment alone.
 * There are none today, and the guard in core/__tests__/no-live-calls.test.ts
 * keeps one from landing in the default path by accident.
 */
const STRIPPED = [...CWD_ENV_KEYS, "ANTHROPIC_BASE_URL", "OPENROUTER_BASE_URL"];

export interface Hermetic {
  env: Record<string, string>;
  /** The throwaway HOME. Assert against this to prove nothing escaped it. */
  home: string;
  cleanup: () => void;
}

/**
 * Build an environment in which no run can reach the real user's data.
 *
 * `extra` is merged last so a caller can pin something specific (a fake
 * endpoint, a port) without having to rebuild the whole thing.
 */
export function hermeticEnv(extra: Record<string, string> = {}): Hermetic {
  const home = mkdtempSync(join(tmpdir(), "yousim-hermetic-"));
  const env: Record<string, string> = {};

  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  // YOUSIM_LIVE is the deliberate-firing switch for a test that must talk to a
  // real provider. Off by default, and the only way to turn it on is to say so.
  if (process.env.YOUSIM_LIVE !== "1") {
    for (const key of STRIPPED) delete env[key];
  }

  Object.assign(env, {
    HOME: home,
    // Windows resolves os.homedir() from USERPROFILE, so HOME alone would
    // leave the real profile directory live there.
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, "xdg-config"),
    XDG_DATA_HOME: join(home, "xdg-data"),
    YOUSIM_HOME: join(home, "yousim"),
    YOUSIM_DB: join(home, "yousim", "test.db"),
    // The one that cannot be undone from inside the process.
    YOUSIM_KEYCHAIN: "0",
    ...extra,
  });

  return {
    env,
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

// ─── The runner ────────────────────────────────────────────────────────────

/** Every `*.test.ts` in the repo, so the runner can prove it found them all. */
async function testFiles(dir = join(REPO_ROOT, "src")): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await testFiles(full)));
    else if (entry.name.endsWith(".test.ts")) out.push(relative(REPO_ROOT, full));
  }
  return out;
}

/**
 * Per-file line coverage from an lcov report.
 *
 * Bun's `coverageThreshold` is a single repo-wide number, which is the shape
 * of threshold this repo specifically does not want, so the floors are checked
 * here against the machine-readable report instead of the pretty table.
 */
function lcovLineCoverage(lcov: string): Map<string, number> {
  const out = new Map<string, number>();
  let file = "";
  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith("SF:")) file = line.slice(3).split(sep).join("/");
    else if (line.startsWith("LF:")) out.set(file, Number(line.slice(3)));
    else if (line.startsWith("LH:")) {
      const total = out.get(file) ?? 0;
      out.set(file, total === 0 ? 100 : (Number(line.slice(3)) / total) * 100);
    }
  }
  return out;
}

function die(message: string): never {
  console.error(`\nhermetic: ${message}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--live");
  const wantCoverage = args.includes("--coverage");
  const covDir = join(REPO_ROOT, "coverage");

  // Opt in explicitly, and say so loudly: this is the mode that can spend the
  // runner's model credit. Never set by CI.
  if (process.argv.includes("--live")) {
    process.env.YOUSIM_LIVE = "1";
    console.warn("hermetic: --live — provider credentials are NOT stripped. Real calls can happen.");
  }

  const expected = await testFiles();
  if (expected.length === 0) {
    die("found no *.test.ts files at all. A gate that runs nothing is not a gate.");
  }

  const { env, home, cleanup } = hermeticEnv();
  // The child is a fresh Bun, and Bun autoloads ./.env from its cwd — which is
  // this repo, whose own .env carries real provider keys. Stripping them from
  // `env` above is undone the instant the child starts unless the load is
  // suppressed here too. Without this flag the "no live call" guarantee is
  // false on any machine that has a repo .env, which is every dev machine;
  // no-live-calls.test.ts is what caught it.
  const bunArgs = ["test", ...args];
  if (process.env.YOUSIM_LIVE !== "1") bunArgs.unshift("--no-env-file");
  if (wantCoverage) {
    bunArgs.push("--coverage-reporter=text", "--coverage-reporter=lcov", `--coverage-dir=${covDir}`);
  }

  console.log(`hermetic: HOME=${home}`);
  console.log(`hermetic: ${expected.length} test files expected\n`);

  const proc = Bun.spawnSync([process.execPath, ...bunArgs], {
    cwd: REPO_ROOT,
    env,
    stdout: "inherit",
    stderr: "pipe",
  });

  // Bun writes the run summary to stderr. It is inherited-then-reprinted
  // rather than piped blindly so a failing assertion is still readable.
  const report = proc.stderr.toString();
  process.stderr.write(report);

  cleanup();

  // Every check is collected rather than fatal on the spot. A failing test
  // does not stop the coverage floors from being evaluated, because "the
  // suite is red AND a floor slipped" is two pieces of information and
  // reporting one of them is how the second gets found a week later.
  const problems: string[] = [];

  if (proc.exitCode !== 0) problems.push(`bun test exited ${proc.exitCode}`);

  // "0 pass" with exit 0 is the failure mode this catches: a runner that
  // matched no files, or a filter that quietly excluded everything.
  const ranFiles = Number(/Ran \d+ tests? across (\d+) files?/.exec(report)?.[1] ?? -1);
  const passed = Number(/(\d+) pass/.exec(report)?.[1] ?? -1);

  if (passed <= 0) problems.push(`no tests passed (parsed "${passed}" from the summary)`);
  if (ranFiles !== expected.length) {
    problems.push(
      `discovered ${ranFiles} test files but ${expected.length} exist on disk.\n` +
        `    A package whose tests are never run is worse than a package with none.\n` +
        expected.map((f) => `      ${f}`).join("\n")
    );
  }

  if (wantCoverage) {
    const lcovPath = join(covDir, "lcov.info");
    if (!existsSync(lcovPath)) {
      problems.push(`--coverage was requested but ${lcovPath} was not written`);
    } else {
      const coverage = lcovLineCoverage(readFileSync(lcovPath, "utf8"));
      let met = 0;
      for (const [file, floor] of Object.entries(COVERAGE_FLOORS)) {
        const actual = coverage.get(file);
        if (actual === undefined) {
          problems.push(`${file}: absent from the coverage report (renamed? no longer imported?)`);
        } else if (actual < floor) {
          problems.push(`${file}: ${actual.toFixed(2)}% lines, floor is ${floor}%`);
        } else {
          met++;
        }
      }
      console.log(`\nhermetic: ${met}/${Object.keys(COVERAGE_FLOORS).length} coverage floors met`);
    }
  }

  if (problems.length > 0) {
    die(`${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}

if (import.meta.main) await main();
