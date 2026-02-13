import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'http://localhost:3000');

// Initialize Supabase client for auth
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_KEY || ''
);

// Get auth token
async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// API client functions
export const api = {
  // Create a new session
  async resetSession(mode?: string): Promise<{ user_id: string; session_id: string }> {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    if (mode) params.append('mode', mode);

    const res = await fetch(`${API_BASE}/reset?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error('Failed to reset session');
    return res.json();
  },

  // Send a manual command
  async sendManual(sessionId: string, command: string): Promise<string> {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_BASE}/manual`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ session_id: sessionId, command })
    });

    if (!res.ok) throw new Error('Failed to send message');
    return res.text();
  },

  // Get session messages
  async getSession(sessionId?: string): Promise<{ session_id: string; messages: any[] }> {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const params = sessionId ? `?session_id=${sessionId}` : '';
    const res = await fetch(`${API_BASE}/session${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error('Failed to get session');
    return res.json();
  },

  // List all sessions
  async getSessions(mode?: string): Promise<any[]> {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const params = mode ? `?mode=${mode}` : '';
    const res = await fetch(`${API_BASE}/sessions${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error('Failed to get sessions');
    return res.json();
  }
};