/**
 * Node and Bun are both supported runtimes. This is the file that proves it.
 *
 * Exactly one thing in this package differs between them: the SQLite binding.
 * Bun has `bun:sqlite` and no `node:sqlite`; Node has `node:sqlite` and no
 * `bun:sqlite`. The choice is made by a conditional `exports` entry on
 * `@yousim/core` ("bun" / "node" / "default"), so no code branches and there
 * is no `typeof Bun` check to get wrong.
 *
 * The failure mode this file exists for is a test that proves nothing: import
 * the store, watch it work, conclude the dual-runtime support is fine. Under
 * `bun test` that only ever exercises the Bun branch, and the Node branch
 * could be broken — or simply never selected — with everything green. Worse,
 * a conditional `exports` map with a typo'd condition name silently falls
 * through to "default", so both runtimes would load the *same* driver and
 * every functional test would still pass.
 *
 * So the claims here are:
 *
 *   1. Two runtimes, one specifier, DIFFERENT bindings. Observed by running
 *      the same probe program under each and comparing, not by asserting that
 *      whichever runtime happens to be running got what it expected.
 *   2. The bindings are interchangeable on disk: a database written by one
 *      opens in the other, in both directions, with the schema intact.
 *   3. The published artifact — a Node bundle launched by its own shebang —
 *      reads a database this suite wrote under Bun.
 *
 * Node is genuinely required for this to mean anything, so a run without it
 * skips loudly rather than passing quietly. CI sets YOUSIM_REQUIRE_NODE=1,
 * which turns the skip into a failure: on a gate, "Node was not installed" is
 * not an acceptable reason for a dual-runtime claim to go unchecked.
 */

import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStorage } from "../storage/sqlite";
import { SQLITE_DRIVER } from "@yousim/core/storage/driver";
import { hermeticEnv, REPO_ROOT } from "../../../../scripts/hermetic";

const PROBE = join(import.meta.dir, "runtime-probe.mjs");

/** The lowest Node this package claims to run on — `engines.node` in the launcher. */
const NODE_FLOOR = 24;

interface Runtime {
  /** Absolute path to the interpreter. */
  bin: string;
  version: string;
}

/**
 * Find a Node new enough to have `node:sqlite` unflagged.
 *
 * YOUSIM_NODE is the escape hatch for a machine whose PATH `node` is older
 * than the floor — common enough, since `engines.node` is ahead of most
 * distributions. Version is parsed rather than trusted: Node 22 has
 * `node:sqlite` too, so a probe run on 22 would pass while saying nothing
 * about the runtime this package actually supports.
 */
function findNode(): { node: Runtime } | { reason: string } {
  const bin = process.env.YOUSIM_NODE || "node";
  // `Bun.spawnSync` rather than node:child_process throughout this file: it is
  // what the rest of the suite uses, and on Windows it launches npm's
  // generated `yousim.cmd` shim, which node's own spawn refuses without
  // `shell: true`. It throws on a missing binary instead of reporting it, so
  // "no Node installed" needs a catch rather than a status check.
  let p: { exitCode: number | null; stdout: Buffer };
  try {
    p = Bun.spawnSync([bin, "--version"]);
  } catch (e) {
    return { reason: `\`${bin} --version\` could not run (${(e as Error).message})` };
  }
  if (p.exitCode !== 0) {
    return { reason: `\`${bin} --version\` failed (exit ${p.exitCode})` };
  }
  const version = p.stdout.toString().trim();
  const major = Number(/^v(\d+)/.exec(version)?.[1] ?? -1);
  if (major < NODE_FLOOR) {
    return { reason: `${bin} is ${version}, and engines.node is >=${NODE_FLOOR}` };
  }
  return { node: { bin, version } };
}

const found = findNode();
const node = "node" in found ? found.node : undefined;

if (!node) {
  const reason = (found as { reason: string }).reason;
  if (process.env.YOUSIM_REQUIRE_NODE === "1") {
    // Deliberately at module scope: this has to fail the file, not skip it.
    throw new Error(
      `YOUSIM_REQUIRE_NODE=1 but no usable Node was found: ${reason}.\n` +
        `This suite cannot check the Node half of a package that claims to run ` +
        `on Node. Install Node >=${NODE_FLOOR}, or point YOUSIM_NODE at one.`
    );
  }
  console.warn(
    `\nruntime-parity: SKIPPING the Node half — ${reason}.\n` +
      `  The bun:sqlite / node:sqlite selection is therefore UNVERIFIED in this run.\n` +
      `  Install Node >=${NODE_FLOOR}, or set YOUSIM_NODE=/path/to/node.\n`
  );
}

/** Run the probe under an interpreter and parse its one line of JSON. */
function probe(bin: string, args: string[]): any {
  const { env, cleanup } = hermeticEnv();
  try {
    const p = Bun.spawnSync([bin, PROBE, ...args], {
      cwd: REPO_ROOT,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = p.stdout.toString();
    if (p.exitCode !== 0) {
      throw new Error(
        `probe failed under ${bin} (exit ${p.exitCode})\n${out}\n${p.stderr.toString()}`
      );
    }
    return JSON.parse(out.trim().split(/\r?\n/).pop()!);
  } finally {
    cleanup();
  }
}

let scratch: string;
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "yousim-parity-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("the SQLite driver is chosen by the runtime, not by the code", () => {
  test("this process (Bun) resolved bun:sqlite", () => {
    // The in-process half. `bun test` is Bun, so the import at the top of this
    // file must have taken the "bun" branch.
    expect(SQLITE_DRIVER).toBe("bun:sqlite");
    expect(new SqliteStorage(join(scratch, "label.db")).driver).toBe("bun:sqlite");
  });

  test.skipIf(!node)("the same specifier gives Bun bun:sqlite and Node node:sqlite", () => {
    // One program, one import specifier, two interpreters. Everything else is
    // held constant — same file, same cwd, same environment.
    const underBun = probe(process.execPath, ["report"]);
    const underNode = probe(node!.bin, ["report"]);

    expect(underBun.runtime).toBe("bun");
    expect(underBun.driver).toBe("bun:sqlite");
    // Read off the constructor, so this is the class that was really bound
    // rather than the label the driver file claims.
    expect(underBun.ctor).toBe("Database");

    expect(underNode.runtime).toBe("node");
    expect(underNode.driver).toBe("node:sqlite");
    expect(underNode.ctor).toBe("DatabaseSync");

    // The assertion that catches a broken `exports` map. A misspelled
    // condition, or a map that lost its "bun" branch, sends both runtimes to
    // "default" — and every other test in this repo still passes.
    expect(underNode.driver).not.toBe(underBun.driver);
    expect(underNode.ctor).not.toBe(underBun.ctor);
  });
});

describe("a database is portable between the two runtimes", () => {
  test.skipIf(!node)("Node opens and reads a database written under Bun", async () => {
    // Written through the real store, not through the driver: the schema, the
    // pragmas and the row shapes are all the product's, so what Node opens is
    // what a Bun user's machine actually has on disk.
    const db = join(scratch, "written-by-bun.db");
    const store = new SqliteStorage(db);
    expect(store.driver).toBe("bun:sqlite");
    await store.upsertUser("local", "local");
    const session = await store.createSession("local", { mode: "simulator", name: "Ada" });
    await store.insertMessage(session.id, "local", "/locate Ada", true);
    await store.insertMessage(session.id, "local", "found her", false);
    store.close();

    const read = probe(node!.bin, ["read", db]);
    expect(read.driver).toBe("node:sqlite");

    // The schema version, so a WAL database written by one binding is not
    // merely openable by the other but understood by it.
    expect(read.userVersion).toBe(1);
    expect(read.sessions).toHaveLength(1);
    expect(read.sessions[0].id).toBe(session.id);
    expect(JSON.parse(read.sessions[0].metadata)).toEqual({ mode: "simulator", name: "Ada" });
    expect(read.messages.map((m: any) => m.content)).toEqual(["/locate Ada", "found her"]);
  });

  test.skipIf(!node)("Bun's store reads a row written under Node", async () => {
    // The other direction, which is the one that matters for a user who
    // installs the published (Node) package and later runs from a Bun
    // checkout, or the reverse.
    const db = join(scratch, "round-trip.db");
    const store = new SqliteStorage(db);
    await store.upsertUser("local", "local");
    const session = await store.createSession("local", { mode: "simulator", name: "Bo" });
    store.close();

    const appended = probe(node!.bin, ["append", db, session.id, "written by node"]);
    expect(appended.driver).toBe("node:sqlite");

    const reopened = new SqliteStorage(db);
    const messages = await reopened.getMessages(session.id, "local");
    expect(messages.map((m) => m.content)).toEqual(["written by node"]);
    expect(messages[0]!.is_user).toBe(false);
    reopened.close();
  });
});

describe("no shipped module reaches for a Bun global", () => {
  /**
   * Every first-party file that ends up in the published bundle.
   *
   * `src/web` is excluded: it runs in a browser, where a `Bun` reference would
   * be a different bug with a different fix. `scripts/` is excluded because it
   * is development tooling that Bun runs by definition — `Bun.spawnSync` there
   * is correct, and forbidding it would be forbidding the build system.
   */
  function shippedSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "dist" || entry.name === "node_modules") {
          continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts")) out.push(full);
      }
    };
    for (const pkg of ["core", "cli", "api", "launcher"]) {
      walk(join(REPO_ROOT, "src", pkg, "src"));
    }
    return out;
  }

  test("`Bun.` appears in no shipped source file", () => {
    // A static check, and static is the right tool here rather than a
    // compromise. The dynamic version does not exist: Node cannot import this
    // source tree at all (extensionless relative specifiers), and running the
    // packaged bundle only exercises the handful of code paths a test drives —
    // so a `Bun.file` added to a rarely-hit route would ship, work perfectly
    // under Bun, and fail on Node for the one user who hit it.
    //
    // The one thing a naive grep would get wrong is comments: this repo talks
    // about `Bun.spawnSync` and `Bun.serve` at length, explaining what each
    // call site was replaced with and why. So each file is transpiled first,
    // which strips comments and type annotations, and the check runs on the
    // code that is actually left.
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    const offenders: string[] = [];

    for (const file of shippedSources()) {
      const code = transpiler.transformSync(readFileSync(file, "utf8"));
      // Member access on the global specifically. `bun:sqlite` as an import
      // specifier is fine and expected — that is the driver, and the whole
      // point is that the resolver decides whether it is reached.
      for (const m of code.matchAll(/\bBun\.[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        offenders.push(`${file.replace(REPO_ROOT + "/", "")}: ${m[0]}`);
      }
    }

    // Named in the failure rather than just counted: the fix is per call site
    // (`Bun.write` -> `node:fs`, `Bun.spawn` -> `node:child_process`, and so
    // on), so the list is the work.
    expect(offenders).toEqual([]);
  });
});

describe("the published artifact", () => {
  test.skipIf(!node)("runs on Node from its own shebang and reads a Bun-written database", async () => {
    // The end-to-end claim, and the only one made against the thing a stranger
    // installs: a bundle whose shebang is `#!/usr/bin/env node`, launched by
    // npm's shim, opening a database this suite wrote with bun:sqlite.
    //
    // `sessions` is the one command that touches storage without making a
    // model call, which is why it is the one used here.
    const { installArtifact } = await import("../../../../scripts/package");
    const install = installArtifact();

    const db = join(scratch, "for-the-artifact.db");
    const store = new SqliteStorage(db);
    await store.upsertUser("local", "local");
    const session = await store.createSession("local", { mode: "simulator", name: "Cy" });
    await store.insertMessage(session.id, "local", "hello from bun", true);
    store.close();

    const { env, cleanup } = hermeticEnv({ YOUSIM_DB: db });
    try {
      const p = Bun.spawnSync([install.bin, "sessions"], {
        cwd: install.dir,
        env,
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = p.stdout.toString();
      const err = p.stderr.toString();
      // The specific way this fails if the bundle ever ships the wrong SQLite
      // branch, called out so the failure names its own cause.
      expect(err).not.toContain("No such built-in module");
      expect(p.exitCode).toBe(0);
      expect(out).toContain("Cy");
      expect(out).toContain("1 msgs");
      expect(out).toContain(session.id.slice(0, 8));

      // The ExperimentalWarning filter in the bin entry. Node emits
      // "ExperimentalWarning: SQLite is an experimental feature" on some
      // versions and not others, so this asserts the absence rather than the
      // presence — the filter's job is that it never reaches the user.
      expect(err).not.toContain("ExperimentalWarning");
    } finally {
      cleanup();
    }
  }, 120_000);

  test("the shipped bundle imports node:sqlite and not bun:sqlite", async () => {
    // The static counterpart. `--target node` is what makes the bundler
    // resolve the "node" branch, and a build that reverted to `--target bun`
    // would produce a file whose shebang says node and whose first database
    // open says "No such built-in module" — a failure no unit test sees,
    // because the source tree runs under Bun where bun:sqlite is correct.
    const { buildArtifact } = await import("../../../../scripts/package");
    const bundle = join(REPO_ROOT, "src", "launcher", "dist", "yousim.js");
    buildArtifact();
    expect(existsSync(bundle)).toBe(true);

    const code = await Bun.file(bundle).text();
    expect(code).toStartWith("#!/usr/bin/env node\n");
    expect(code).toContain('from "node:sqlite"');
    // Matched as an import rather than as a substring: the launcher manifest
    // is inlined into the bundle for `--version`, and its comments mention
    // bun:sqlite by name.
    expect(code).not.toMatch(/(from|require\(|import\()\s*["']bun:sqlite["']/);
  }, 120_000);
});
