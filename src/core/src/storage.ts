// Storage interface and types for YouSim
// Four entities: sessions, messages, summaries, users

export interface StoredSession {
  id: string;
  user_id: string;
  created_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface StoredMessage {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  is_user: boolean;
  created_at: string;
}

export interface StoredSummary {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Storage {
  // Sessions
  createSession(userId: string, metadata?: Record<string, any>): Promise<StoredSession>;
  getSession(sessionId: string, userId: string): Promise<StoredSession | null>;
  getSessions(userId: string, mode?: string): Promise<StoredSession[]>;
  updateSessionMetadata(sessionId: string, userId: string, metadata: Record<string, any>): Promise<StoredSession>;
  deleteSession(sessionId: string, userId: string): Promise<void>;

  // Messages
  getMessages(sessionId: string, userId: string): Promise<StoredMessage[]>;
  insertMessage(sessionId: string, userId: string, content: string, isUser: boolean): Promise<StoredMessage>;

  // Summaries
  getSummaries(sessionId: string, userId: string): Promise<StoredSummary[]>;
  getLatestSummary(sessionId: string, userId: string): Promise<StoredSummary | null>;
  insertSummary(sessionId: string, userId: string, content: string): Promise<StoredSummary>;

  // Users
  upsertUser(id: string, name: string): Promise<{ id: string }>;
}
