/**
 * The `bun:sqlite` driver. Selected by the "bun" condition in
 * `@yousim/core`'s exports — see `./driver.ts` for why the choice is made
 * there rather than here.
 *
 * Never import this file directly. Import "@yousim/core/storage/driver" and
 * let the runtime pick; a direct import is how a Bun-only path gets into code
 * that has to run on Node too.
 */

import { Database } from "bun:sqlite";
import type { SqliteDatabaseConstructor } from "./driver";

/**
 * Typed through the shared contract, which is what makes the two drivers
 * interchangeable rather than merely similar: if `bun:sqlite` ever stops
 * satisfying the slice `sqlite.ts` uses, this assignment fails to compile.
 */
export const SqliteDatabase: SqliteDatabaseConstructor = Database;

/**
 * Which binding is in use, for anything that needs to *report* the runtime
 * rather than behave differently on it — `yousim config`, and the test that
 * proves the resolver really did pick per runtime instead of the code merely
 * having run.
 */
export const SQLITE_DRIVER = "bun:sqlite";
