import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { dataHome } from "../config";
import type { Storage, StoredSession, StoredMessage, StoredSummary } from "../storage";

/** Current schema version, tracked in `PRAGMA user_version`. */
export const SCHEMA_VERSION = 1;

/**
 * Where the database lives:
 *   1. an explicit path
 *   2. $YOUSIM_DB   — useful for tests and separate profiles
 *   3. dataHome()   — the shared resolver, so paths can't disagree
 */
export function resolveDbPath(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.YOUSIM_DB) return process.env.YOUSIM_DB;
  return path.join(dataHome(), "yousim.db");
}

/**
 * SQLite storage using bun:sqlite (built-in, zero npm deps).
 *
 * Bun-only: never import this from the contract surface, which has to stay
 * usable in a browser and on an edge runtime.
 */
export class SqliteStorage implements Storage {
  private db: Database;
  readonly path: string;

  constructor(dbPath?: string) {
    this.path = resolveDbPath(dbPath);
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    this.db = new Database(this.path);
    // Conversations are private. The 0700 directory already covers this on a
    // single-user machine, but the file's own mode is what survives someone
    // widening the directory, copying it, or a differing umask.
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.chmodSync(this.path + suffix, 0o600);
      } catch {
        // -wal/-shm may not exist yet; the main file is created by the open above
      }
    }
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  /** Close the handle. WAL means an unclean exit still leaves a valid file. */
  close() {
    this.db.close();
  }

  private migrate() {
    const current = (this.db.query("PRAGMA user_version").get() as any)?.user_version ?? 0;
    if (current > SCHEMA_VERSION) {
      throw new Error(
        `Database at ${this.path} has schema v${current}, but this build only ` +
          `understands v${SCHEMA_VERSION}. Upgrade yousim, or point YOUSIM_DB elsewhere.`
      );
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        is_user INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON summaries(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
    `);

    // Recorded so a future version can migrate rather than guess, and so an
    // older build refuses a newer file instead of corrupting it.
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  // Sessions

  async createSession(userId: string, metadata: Record<string, any> = {}): Promise<StoredSession> {
    // sessions.user_id is a real foreign key and `foreign_keys` is ON, so a
    // session for an owner that has never been written fails outright with
    // "FOREIGN KEY constraint failed". Only the API's `GET /user` wrote that
    // row, so every other entry point 500'd on a database it had just created
    // itself. Ensuring it here rather than in each caller is what makes that
    // true for the next entry point too.
    //
    // OR IGNORE rather than an upsert: an owner that already exists keeps the
    // name it was given.
    this.db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(userId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (id, user_id, created_at, is_active, metadata) VALUES (?, ?, ?, 1, ?)")
      .run(id, userId, now, JSON.stringify(metadata));
    return { id, user_id: userId, created_at: now, is_active: true, metadata };
  }

  async getSession(sessionId: string, userId: string): Promise<StoredSession | null> {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
      .get(sessionId, userId) as any;
    if (!row) return null;
    return this.toSession(row);
  }

  async getSessions(userId: string, mode?: string): Promise<StoredSession[]> {
    let rows: any[];
    if (mode) {
      rows = this.db
        .prepare("SELECT * FROM sessions WHERE user_id = ? AND json_extract(metadata, '$.mode') = ? ORDER BY created_at DESC")
        .all(userId, mode);
    } else {
      rows = this.db
        .prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId);
    }
    return rows.map((r) => this.toSession(r));
  }

  async updateSessionMetadata(
    sessionId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<StoredSession> {
    this.db
      .prepare("UPDATE sessions SET metadata = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(metadata), sessionId, userId);
    const session = await this.getSession(sessionId, userId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    this.db.prepare("DELETE FROM messages WHERE session_id = ? AND user_id = ?").run(sessionId, userId);
    this.db.prepare("DELETE FROM summaries WHERE session_id = ? AND user_id = ?").run(sessionId, userId);
    this.db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(sessionId, userId);
  }

  // Messages

  async getMessages(sessionId: string, userId: string): Promise<StoredMessage[]> {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC")
      .all(sessionId, userId) as any[];
    return rows.map((r) => this.toMessage(r));
  }

  async insertMessage(
    sessionId: string,
    userId: string,
    content: string,
    isUser: boolean
  ): Promise<StoredMessage> {
    // Ownership is (session_id, user_id), not session_id alone. Without this a
    // caller can write into someone else's session: the row is accepted, the
    // owner cannot see it, and the writer can — orphaned data attributed to
    // the wrong user. Not reachable through the single-user local API, but the
    // Storage contract is what a multi-user consumer implements against.
    const owner = await this.getSession(sessionId, userId);
    if (!owner) {
      throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (id, session_id, user_id, content, is_user, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, sessionId, userId, content, isUser ? 1 : 0, now);
    return { id, session_id: sessionId, user_id: userId, content, is_user: isUser, created_at: now };
  }

  // Summaries

  async getSummaries(sessionId: string, userId: string): Promise<StoredSummary[]> {
    const rows = this.db
      .prepare("SELECT * FROM summaries WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC")
      .all(sessionId, userId) as any[];
    return rows.map((r) => this.toSummary(r));
  }

  async getLatestSummary(sessionId: string, userId: string): Promise<StoredSummary | null> {
    const row = this.db
      .prepare("SELECT * FROM summaries WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(sessionId, userId) as any;
    if (!row) return null;
    return this.toSummary(row);
  }

  async insertSummary(sessionId: string, userId: string, content: string): Promise<StoredSummary> {
    // Ownership is (session_id, user_id), not session_id alone. Without this a
    // caller can write into someone else's session: the row is accepted, the
    // owner cannot see it, and the writer can — orphaned data attributed to
    // the wrong user. Not reachable through the single-user local API, but the
    // Storage contract is what a multi-user consumer implements against.
    const owner = await this.getSession(sessionId, userId);
    if (!owner) {
      throw new Error(`Session ${sessionId} does not belong to user ${userId}`);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO summaries (id, session_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, userId, content, now);
    return { id, session_id: sessionId, user_id: userId, content, created_at: now };
  }

  // Users

  async upsertUser(id: string, name: string): Promise<{ id: string }> {
    this.db
      .prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name")
      .run(id, name);
    return { id };
  }

  // Row mappers

  private toSession(row: any): StoredSession {
    return {
      id: row.id,
      user_id: row.user_id,
      created_at: row.created_at,
      is_active: Boolean(row.is_active),
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  private toMessage(row: any): StoredMessage {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      content: row.content,
      is_user: Boolean(row.is_user),
      created_at: row.created_at,
    };
  }

  private toSummary(row: any): StoredSummary {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
    };
  }
}
