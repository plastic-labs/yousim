export type { Storage, StoredSession, StoredMessage, StoredSummary } from "../storage";
export { MemoryStorage } from "./memory";
export { SqliteStorage } from "./sqlite";

import type { Storage } from "../storage";
import { MemoryStorage } from "./memory";
import { SqliteStorage } from "./sqlite";

/**
 * Factory function to create the appropriate storage backend.
 *
 * Auto-detection order:
 *   1. SUPABASE_URL set → "supabase" (must be created separately in @yousim/api)
 *   2. Explicit type passed → use that
 *   3. Default → "sqlite" for server, "memory" for cli
 */
export function createStorage(type?: "memory" | "sqlite" | "supabase"): Storage {
  const resolved = type || (process.env.SUPABASE_URL ? "supabase" : "sqlite");

  switch (resolved) {
    case "memory":
      return new MemoryStorage();
    case "sqlite":
      return new SqliteStorage();
    case "supabase":
      throw new Error(
        "Supabase storage must be created via @yousim/api SupabaseStorage class. " +
        "Import { SupabaseStorage } from '@yousim/api' instead."
      );
    default:
      throw new Error(`Unknown storage type: ${resolved}`);
  }
}
