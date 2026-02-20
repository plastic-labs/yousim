import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_URL || '';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || '';
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

// Initialize Supabase client for auth (only if configured)
export const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Get auth token — returns null in local mode (no auth needed)
async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

function buildHeaders(token: string | null, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function streamRequest(url: string, options: RequestInit): Promise<ReadableStreamDefaultReader<string>> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  return reader;
}

// API client functions
export const api = {
  // Create a new session
  async resetSession(mode?: string): Promise<{ user_id: string; session_id: string }> {
    const token = await getAuthToken();

    const params = new URLSearchParams();
    if (mode) params.append('mode', mode);

    const res = await fetch(`${API_BASE}/reset?${params}`, {
      method: 'POST',
      headers: buildHeaders(token),
    });

    if (!res.ok) throw new Error('Failed to reset session');
    return res.json();
  },

  // Send a manual command
  async sendManual(sessionId: string, command: string): Promise<string> {
    const token = await getAuthToken();

    const res = await fetch(`${API_BASE}/manual`, {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ session_id: sessionId, command }),
    });

    if (!res.ok) throw new Error('Failed to send message');
    return res.text();
  },

  async streamManual(sessionId: string, command: string): Promise<ReadableStreamDefaultReader<string>> {
    const token = await getAuthToken();

    return streamRequest(`${API_BASE}/manual`, {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ session_id: sessionId, command }),
    });
  },

  async sendAuto(sessionId: string): Promise<string> {
    const token = await getAuthToken();

    const res = await fetch(`${API_BASE}/auto`, {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!res.ok) throw new Error('Failed to send auto command');
    return res.text();
  },

  async streamAuto(sessionId: string): Promise<ReadableStreamDefaultReader<string>> {
    const token = await getAuthToken();

    return streamRequest(`${API_BASE}/auto`, {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  // Get session messages
  async getSession(sessionId?: string): Promise<{ session_id: string; messages: any[] }> {
    const token = await getAuthToken();

    const params = sessionId ? `?session_id=${sessionId}` : '';
    const res = await fetch(`${API_BASE}/session${params}`, {
      headers: buildHeaders(token),
    });

    if (!res.ok) throw new Error('Failed to get session');
    return res.json();
  },

  // List all sessions
  async getSessions(mode?: string): Promise<any[]> {
    const token = await getAuthToken();

    const params = mode ? `?mode=${mode}` : '';
    const res = await fetch(`${API_BASE}/sessions${params}`, {
      headers: buildHeaders(token),
    });

    if (!res.ok) throw new Error('Failed to get sessions');
    return res.json();
  },

  async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<{ session_id: string; metadata: Record<string, any> }> {
    const token = await getAuthToken();

    const res = await fetch(`${API_BASE}/sessions/${sessionId}/metadata`, {
      method: 'PUT',
      headers: buildHeaders(token, true),
      body: JSON.stringify(metadata),
    });

    if (!res.ok) throw new Error('Failed to update session metadata');
    return res.json();
  },
};
