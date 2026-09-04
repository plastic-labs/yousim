/**
 * The SQLite binding contract, and nothing else.
 *
 * There is exactly one thing in this package that genuinely differs between
 * Node and Bun: the SQLite module. Bun has `bun:sqlite` and no `node:sqlite`
 * ("No such built-in module"); Node has `node:sqlite` and no `bun:sqlite`. A
 * single import cannot cover both, and no amount of rewriting makes it.
 *
 * So the choice is made by the *resolver*, not by this code: `@yousim/core`
 * declares a conditional `exports` entry for "./storage/driver" with "bun",
 * "node" and "default" branches, and each runtime picks its own file. Nothing
 * in `sqlite.ts` branches, and there is no `typeof Bun !== "undefined"`
 * anywhere in the storage layer — which matters because a runtime check is a
 * thing that can be wrong at runtime, and a resolver condition cannot.
 *
 * This file holds the shared *type* so both drivers are checked against one
 * contract. Without it each driver would only be checked against its own
 * binding's types, and the two could drift until the untested runtime broke.
 *
 * It is deliberately import-free: it names the small slice of the API
 * `sqlite.ts` actually uses, which is the slice both bindings agree on.
 * `bun:sqlite`'s `Database` and `node:sqlite`'s `DatabaseSync` are
 * interchangeable within it — the differences (Bun's `.query()` cache, Node's
 * options bag) are outside it on purpose.
 */

/** Anything either binding will accept as a bound parameter. */
export type SqliteParam = string | number | bigint | null | Uint8Array;

export interface SqliteStatement {
  run(...params: SqliteParam[]): unknown;
  /** A single row, or undefined/null when the query matched nothing. */
  get(...params: SqliteParam[]): unknown;
  all(...params: SqliteParam[]): unknown[];
}

export interface SqliteDatabase {
  /**
   * Run one or more statements for effect.
   *
   * Both bindings accept a multi-statement string and both tolerate a
   * statement that returns rows (`PRAGMA journal_mode = WAL`), discarding them.
   */
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export interface SqliteDatabaseConstructor {
  new (path: string): SqliteDatabase;
}
