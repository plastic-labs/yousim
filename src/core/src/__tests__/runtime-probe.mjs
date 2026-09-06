/**
 * A one-file program that reports which SQLite binding the runtime resolved,
 * and can read and write the schema with it.
 *
 * Run under Node and under Bun by `runtime-parity.test.ts`. Not a test itself
 * (it has no assertions and does not match `*.test.ts`) — it is the thing the
 * two runtimes are pointed at, so that the only difference between the two
 * observations is the interpreter.
 *
 * Plain `.mjs`, deliberately, for two reasons:
 *
 *   - It must be byte-identical work on both runtimes. A `.ts` probe would be
 *     type-stripped by Node and transpiled by Bun, which is one more
 *     difference between the runs than this is trying to measure.
 *   - Node's ESM resolver needs a file extension on every relative specifier,
 *     and this repo's TypeScript is written extensionless. So Node cannot
 *     import `@yousim/core/storage` from source at all — only the bundled
 *     artifact, where the relative imports are gone. The driver export has no
 *     runtime-relative imports (its only non-builtin import is `import type`,
 *     which erases), so it is reachable from source on both.
 *
 * It lives inside the repo rather than being written to a temp directory
 * because "@yousim/core/storage/driver" has to resolve, and resolution is the
 * entire subject.
 *
 * Usage:
 *   runtime-probe.mjs report
 *   runtime-probe.mjs read   <db>
 *   runtime-probe.mjs append <db> <session-id> <text>
 *
 * Prints one line of JSON on stdout. Anything else is a failure.
 */

import { SqliteDatabase, SQLITE_DRIVER } from "@yousim/core/storage/driver";

const [mode, dbPath, sessionId, text] = process.argv.slice(2);

/** What this runtime calls itself, for the report. */
const runtime = typeof globalThis.Bun !== "undefined" ? "bun" : "node";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

if (mode === "report") {
  out({
    runtime,
    // The value the resolver chose. This is the whole point: the specifier is
    // identical in both runs, so a difference here can only have come from
    // the conditional `exports` entry.
    driver: SQLITE_DRIVER,
    // And the class actually bound, read off the constructor rather than
    // taken on trust from the string above — a driver file that exported the
    // wrong label would still be caught here.
    ctor: SqliteDatabase.name,
  });
} else if (mode === "read") {
  const db = new SqliteDatabase(dbPath);
  out({
    runtime,
    driver: SQLITE_DRIVER,
    userVersion: db.prepare("PRAGMA user_version").get().user_version,
    sessions: db.prepare("SELECT id, metadata FROM sessions ORDER BY created_at").all(),
    messages: db
      .prepare("SELECT session_id, content, is_user FROM messages ORDER BY created_at")
      .all(),
  });
  db.close();
} else if (mode === "append") {
  const db = new SqliteDatabase(dbPath);
  // Deliberately not through SqliteStorage: see the note above about Node and
  // extensionless specifiers. One INSERT against the same schema is enough to
  // show that a row this runtime wrote is a row the other runtime's store can
  // read, and it keeps the schema itself in exactly one place.
  db.prepare(
    "INSERT INTO messages (id, session_id, user_id, content, is_user, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), sessionId, "local", text, 0, new Date().toISOString());
  db.close();
  out({ runtime, driver: SQLITE_DRIVER, appended: text });
} else {
  process.stderr.write(`unknown mode: ${mode}\n`);
  process.exit(2);
}
