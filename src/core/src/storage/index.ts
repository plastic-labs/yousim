export type { Storage, StoredSession, StoredMessage, StoredSummary } from "../storage";
export { MemoryStorage } from "./memory";
export { SqliteStorage } from "./sqlite";

import type { Storage } from "../storage";
import { MemoryStorage } from "./memory";
import { SqliteStorage } from "./sqlite";

/**
 * Create a local storage backend.
 *
 * The open package only ships local stores. A hosted deployment implements
 * `Storage` itself against whatever it uses (see contract.ts) rather than
 * being selected here.
 */
export function createStorage(type: "memory" | "sqlite" = "sqlite"): Storage {
  switch (type) {
    case "memory":
      return new MemoryStorage();
    case "sqlite":
      return new SqliteStorage();
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}
