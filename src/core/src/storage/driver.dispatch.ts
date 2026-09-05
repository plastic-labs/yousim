/**
 * The SQLite binding, chosen at runtime rather than by the resolver.
 *
 * This file exists for exactly one consumer: the published bundle. Everywhere
 * else, `driver.bun.ts` and `driver.node.ts` are selected by the conditional
 * `exports` entry, and that is the better mechanism — a resolver condition
 * cannot be wrong at runtime, whereas the check below can.
 *
 * But a resolver condition is evaluated by whoever resolves, and for the
 * published artifact that is the *bundler*, at build time. `bun build` picks
 * one branch and inlines it, so the tarball does not contain a conditional
 * import at all — it contains a decision already made. The result ran on
 * exactly one runtime while the README promised two: bundling for Node emitted
 * a hoisted `import { DatabaseSync } from "node:sqlite"`, and Bun has no such
 * module, so every subcommand died at resolve time before any of our code ran.
 *
 * Two details are load-bearing, and both were arrived at by trying:
 *
 * `createRequire`, not `await import()`. `SqliteStorage`'s constructor calls
 * `new SqliteDatabase(path)` synchronously; a dynamic import would make the
 * binding a promise and turn that constructor — and everything holding one —
 * async. A synchronous require of a builtin keeps the change inside this file.
 *
 * A *computed* specifier, plus `--external` on both, so neither name survives
 * as a static import the bundler hoists. That also fixes a second bug for
 * free: `node:sqlite` emits an ExperimentalWarning on some Node 24.x patch
 * releases at module-link time, which happens before any body code, so the
 * entry point's warning filter was installed too late and every invocation —
 * `--version` included — printed to stderr. Requiring it lazily puts the load
 * after the filter.
 */

import { createRequire } from "node:module";
import type { SqliteDatabaseConstructor } from "./driver";

const require_ = createRequire(import.meta.url);

/**
 * Feature-detect rather than trust a build flag: this file is bundled once and
 * then run by whichever runtime the user has.
 */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

/** Which binding actually loaded. Asserted by `runtime-parity.test.ts`. */
export const SQLITE_DRIVER = isBun ? "bun:sqlite" : "node:sqlite";

const binding = require_(SQLITE_DRIVER) as {
  Database?: SqliteDatabaseConstructor;
  DatabaseSync?: SqliteDatabaseConstructor;
};

/**
 * `bun:sqlite` calls it `Database`, `node:sqlite` calls it `DatabaseSync`.
 * They are interchangeable across the slice of the API `sqlite.ts` uses, which
 * is what `driver.ts` pins.
 */
const ctor = isBun ? binding.Database : binding.DatabaseSync;

if (!ctor) {
  // Reachable if a future runtime renames the export. Better a named failure
  // here than `undefined is not a constructor` at the first database open.
  throw new Error(
    `${SQLITE_DRIVER} loaded but exported no ${isBun ? "Database" : "DatabaseSync"} constructor`
  );
}

export const SqliteDatabase: SqliteDatabaseConstructor = ctor;
