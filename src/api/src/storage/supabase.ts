import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Storage, StoredSession, StoredMessage, StoredSummary } from "@yousim/core";

/**
 * Supabase storage adapter.
 * Extracts the inline Supabase calls from the old API index.ts into a Storage implementation.
 */
export class SupabaseStorage implements Storage {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string, accessToken?: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : undefined,
    });
  }

  /** Create a new SupabaseStorage with a specific access token (for per-request RLS). */
  withToken(supabaseUrl: string, supabaseKey: string, accessToken: string): SupabaseStorage {
    return new SupabaseStorage(supabaseUrl, supabaseKey, accessToken);
  }

  // Sessions

  async createSession(userId: string, metadata: Record<string, any> = {}): Promise<StoredSession> {
    const { data, error } = await this.client
      .from("sessions")
      .insert({ user_id: userId, metadata })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.toSession(data);
  }

  async getSession(sessionId: string, userId: string): Promise<StoredSession | null> {
    const { data, error } = await this.client
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    return this.toSession(data);
  }

  async getSessions(userId: string, mode?: string): Promise<StoredSession[]> {
    let query = this.client
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (mode) {
      query = query.filter("metadata->>mode", "eq", mode);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => this.toSession(r));
  }

  async updateSessionMetadata(
    sessionId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<StoredSession> {
    const { data, error } = await this.client
      .from("sessions")
      .update({ metadata })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.toSession(data);
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from("sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  }

  // Messages

  async getMessages(sessionId: string, userId: string): Promise<StoredMessage[]> {
    const { data, error } = await this.client
      .from("messages")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => this.toMessage(r));
  }

  async insertMessage(
    sessionId: string,
    userId: string,
    content: string,
    isUser: boolean
  ): Promise<StoredMessage> {
    const { data, error } = await this.client
      .from("messages")
      .insert({
        session_id: sessionId,
        user_id: userId,
        content,
        is_user: isUser,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.toMessage(data);
  }

  // Summaries

  async getSummaries(sessionId: string, userId: string): Promise<StoredSummary[]> {
    const { data, error } = await this.client
      .from("summaries")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => this.toSummary(r));
  }

  async getLatestSummary(sessionId: string, userId: string): Promise<StoredSummary | null> {
    const { data, error } = await this.client
      .from("summaries")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return this.toSummary(data);
  }

  async insertSummary(sessionId: string, userId: string, content: string): Promise<StoredSummary> {
    const { data, error } = await this.client
      .from("summaries")
      .insert({
        session_id: sessionId,
        user_id: userId,
        content,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.toSummary(data);
  }

  // Users

  async upsertUser(id: string, name: string): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from("users")
      .upsert({ id, name })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: data.id };
  }

  // Row mappers

  private toSession(row: any): StoredSession {
    return {
      id: row.id,
      user_id: row.user_id,
      created_at: row.created_at,
      is_active: row.is_active ?? true,
      metadata: row.metadata || {},
    };
  }

  private toMessage(row: any): StoredMessage {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      content: row.content,
      is_user: row.is_user,
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
