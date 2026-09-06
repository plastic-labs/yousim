/**
 * The `node:sqlite` driver. Selected by the "node" condition in
 * `@yousim/core`'s exports, and by "default" for any other runtime — see
 * `./driver.ts` for why the choice is made there rather than here.
 *
 * Never import this file directly. Import "@yousim/core/storage/driver" and
 * let the runtime pick; a direct import is how a Node-only path gets into
 * code that has to run on Bun too.
 *
 * `node:sqlite` is why `engines.node` is ">=24": it is the built-in that makes
 * a zero-dependency install possible. Widening the floor with a native SQLite
 * package would put a compile step in front of `npx yousim`, which is a worse
 * trade than asking for a current Node.
 */

import { DatabaseSync } from "node:sqlite";
import type { SqliteDatabaseConstructor } from "./driver";

/**
 * Typed through the shared contract, which is what makes the two drivers
 * interchangeable rather than merely similar: if `node:sqlite` ever stops
 * satisfying the slice `sqlite.ts` uses, this assignment fails to compile.
 */
export const SqliteDatabase: SqliteDatabaseConstructor = DatabaseSync;

/**
 * Which binding is in use, for anything that needs to *report* the runtime
 * rather than behave differently on it — `yousim config`, and the test that
 * proves the resolver really did pick per runtime instead of the code merely
 * having run.
 */
export const SQLITE_DRIVER = "node:sqlite";
