import type { Storage, StoredSession, StoredMessage, StoredSummary } from "../storage";

/**
 * In-memory storage implementation. Zero dependencies.
 * Used by CLI mode — data lives only for the process lifetime.
 */
export class MemoryStorage implements Storage {
  private sessions: Map<string, StoredSession> = new Map();
  private messages: Map<string, StoredMessage[]> = new Map();
  private summaries: Map<string, StoredSummary[]> = new Map();
  private users: Map<string, { id: string; name: string }> = new Map();

  // Sessions

  async createSession(userId: string, metadata: Record<string, any> = {}): Promise<StoredSession> {
    const session: StoredSession = {
      id: crypto.randomUUID(),
      user_id: userId,
      created_at: new Date().toISOString(),
      is_active: true,
      metadata,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string, userId: string): Promise<StoredSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) return null;
    return session;
  }

  async getSessions(userId: string, mode?: string): Promise<StoredSession[]> {
    const all = Array.from(this.sessions.values())
      .filter((s) => s.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (mode) {
      return all.filter((s) => s.metadata?.mode === mode);
    }
    return all;
  }

  async updateSessionMetadata(
    sessionId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<StoredSession> {
    const session = this.sessions.get(sessionId);
    if (!session || session.user_id !== userId) {
      throw new Error("Session not found");
    }
    session.metadata = metadata;
    return session;
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.user_id === userId) {
      this.sessions.delete(sessionId);
      this.messages.delete(sessionId);
      this.summaries.delete(sessionId);
    }
  }

  // Messages

  async getMessages(sessionId: string, userId: string): Promise<StoredMessage[]> {
    return (this.messages.get(sessionId) || []).filter((m) => m.user_id === userId);
  }

  async insertMessage(
    sessionId: string,
    userId: string,
    content: string,
    isUser: boolean
  ): Promise<StoredMessage> {
    const message: StoredMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: userId,
      content,
      is_user: isUser,
      created_at: new Date().toISOString(),
    };
    const existing = this.messages.get(sessionId) || [];
    existing.push(message);
    this.messages.set(sessionId, existing);
    return message;
  }

  // Summaries

  async getSummaries(sessionId: string, userId: string): Promise<StoredSummary[]> {
    return (this.summaries.get(sessionId) || [])
      .filter((s) => s.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getLatestSummary(sessionId: string, userId: string): Promise<StoredSummary | null> {
    const summaries = await this.getSummaries(sessionId, userId);
    return summaries[0] || null;
  }

  async insertSummary(sessionId: string, userId: string, content: string): Promise<StoredSummary> {
    const summary: StoredSummary = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: userId,
      content,
      created_at: new Date().toISOString(),
    };
    const existing = this.summaries.get(sessionId) || [];
    existing.push(summary);
    this.summaries.set(sessionId, existing);
    return summary;
  }

  // Users

  async upsertUser(id: string, name: string): Promise<{ id: string }> {
    this.users.set(id, { id, name });
    return { id };
  }
}
