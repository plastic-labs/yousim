import React, { useState, useEffect } from 'react';
import { supabase, api } from './api';
import './index.css';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);

  // Check authentication status
  useEffect(() => {
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      if (session) {
        loadOrCreateSession();
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    setIsAuthenticated(!!data.session);
    setLoading(false);

    if (data.session) {
      loadOrCreateSession();
    }
  }

  async function signInAnonymously() {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('Auth error:', error);
      alert('Failed to sign in: ' + error.message);
    }
    setLoading(false);
  }

  async function loadOrCreateSession() {
    try {
      // Try to get latest session
      const sessions = await api.getSessions();
      if (sessions.length > 0) {
        const latestSession = sessions[0];
        setSessionId(latestSession.id);
        loadMessages(latestSession.id);
      } else {
        // Create new session
        const { session_id } = await api.resetSession();
        setSessionId(session_id);
      }
    } catch (error: any) {
      console.error('Session error:', error);
    }
  }

  async function loadMessages(sid?: string) {
    try {
      const { messages: msgs } = await api.getSession(sid || sessionId || undefined);
      setMessages(msgs);
    } catch (error) {
      console.error('Load messages error:', error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || !sessionId || sending) return;

    setSending(true);
    try {
      const response = await api.sendManual(sessionId, command);
      setCommand('');

      // Reload messages to see the new conversation
      await loadMessages();
    } catch (error: any) {
      console.error('Send error:', error);
      alert('Failed to send message: ' + error.message);
    } finally {
      setSending(false);
    }
  }

  async function handleReset() {
    try {
      const { session_id } = await api.resetSession();
      setSessionId(session_id);
      setMessages([]);
    } catch (error) {
      console.error('Reset error:', error);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>YouSim</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>YouSim - Identity Simulator</h1>
        <p>Simulate identities within the latent space of Claude</p>
        <button
          onClick={signInAnonymously}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          Start Simulation
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>YouSim</h1>
        <button onClick={handleReset} style={{ padding: '5px 15px' }}>
          New Session
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '20px',
          minHeight: '400px',
          maxHeight: '600px',
          overflowY: 'auto',
          marginBottom: '20px',
          backgroundColor: '#f9f9f9'
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center' }}>
            Start by sending a command like "/locate Einstein"
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '15px',
                padding: '10px',
                borderRadius: '6px',
                backgroundColor: msg.is_user ? '#e3f2fd' : '#fff3e0'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '12px' }}>
                {msg.is_user ? '🔵 You' : '🟡 Simulator'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command (e.g., /locate Einstein)"
          disabled={sending}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '16px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        <button
          type="submit"
          disabled={sending || !command.trim()}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: sending ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: sending ? '#ccc' : '#007bff',
            color: 'white'
          }}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {sessionId && (
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          Session: {sessionId}
        </p>
      )}
    </div>
  );
};

export default App;
