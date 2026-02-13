import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, supabase } from './api';
import { terminalConfig, simCommands, metaCommands, keyHints } from './config';
import './index.css';

type SessionMessage = {
  id?: string;
  content: string;
  created_at?: string;
  is_user: boolean;
};

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [name, setName] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [tempInput, setTempInput] = useState('');
  const [showIntro, setShowIntro] = useState(true);
  const [clearAt, setClearAt] = useState(0);
  const [extraSections, setExtraSections] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const colors = terminalConfig.colors;
    root.style.setProperty('--bg', colors.background);
    root.style.setProperty('--fg', colors.foreground);
    root.style.setProperty('--banner', colors.banner);
    root.style.setProperty('--border', colors.border.color);
    root.style.setProperty('--prompt-default', colors.prompt.default);
    root.style.setProperty('--prompt-host', colors.prompt.host);
    root.style.setProperty('--prompt-user', colors.prompt.user);
    root.style.setProperty('--prompt-input', colors.prompt.input);
    root.style.setProperty('--link', colors.link.text);
    root.style.setProperty('--link-highlight', colors.link.highlightColor);
    root.style.setProperty('--link-highlight-text', colors.link.highlightText);
    root.style.setProperty('--command', colors.commands.textColor);
    root.style.setProperty('--simulator', colors.simulator);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Auth error:', error);
        } else {
          await loadOrCreateSession();
        }
      } else {
        await loadOrCreateSession();
      }
      setReady(true);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadOrCreateSession();
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, extraSections, showIntro, clearAt]);

  useEffect(() => {
    if (ready && !sending) {
      inputRef.current?.focus();
    }
  }, [ready, sending]);

  const loadOrCreateSession = async () => {
    try {
      const sessions = await api.getSessions('simulator');
      if (sessions.length > 0) {
        const latestSession = sessions[0];
        setSessionId(latestSession.id);
        await loadMessages(latestSession.id);
      } else {
        const { session_id } = await api.resetSession('simulator');
        setSessionId(session_id);
        setMessages([]);
        setName('');
      }
    } catch (error: any) {
      console.error('Session error:', error);
    }
  };

  const loadMessages = async (sid?: string) => {
    try {
      const { messages: msgs } = await api.getSession(sid || sessionId || undefined);
      setMessages(msgs);
      if (!name && msgs.length > 0) {
        const first = msgs[0];
        if (first?.content?.startsWith('/locate ')) {
          setName(first.content.slice(8));
        }
      }
    } catch (error) {
      console.error('Load messages error:', error);
    }
  };

  const handleReset = async () => {
    if (!sessionId) return;
    try {
      const { session_id } = await api.resetSession('simulator');
      setSessionId(session_id);
      setMessages([]);
      setName('');
      setHistory([]);
      setHistoryIndex(0);
      setTempInput('');
      setShowIntro(true);
      setExtraSections([]);
      setClearAt(0);
    } catch (error) {
      console.error('Reset error:', error);
    }
  };

  const handleCommand = async () => {
    if (!sessionId || sending) return;

    const trimmed = command.trim();
    if (!trimmed && !name) return;

    if (trimmed) {
      const nextHistory = [...history, trimmed];
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length);
    }

    if (trimmed === 'clear') {
      setShowIntro(false);
      setExtraSections([]);
      setClearAt(messages.length);
      setCommand('');
      return;
    }

    if (trimmed === 'help') {
      setExtraSections((prev) => [...prev, `help-${Date.now()}`]);
      setCommand('');
      return;
    }

    if (trimmed === 'banner') {
      setExtraSections((prev) => [...prev, `banner-${Date.now()}`]);
      setCommand('');
      return;
    }

    if (trimmed === 'reset') {
      await handleReset();
      setCommand('');
      return;
    }

    setSending(true);
    try {
      if (!trimmed && name) {
        await api.sendAuto(sessionId);
      } else if (!name) {
        const newName = trimmed;
        setName(newName);
        try {
          await api.updateSessionMetadata(sessionId, { name: newName });
        } catch (error) {
          console.error('Metadata update failed:', error);
        }
        await api.sendManual(sessionId, `/locate ${newName}`);
      } else {
        await api.sendManual(sessionId, trimmed);
      }

      setCommand('');
      await loadMessages();
    } catch (error: any) {
      console.error('Send error:', error);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleCommand();
        break;
      case 'Escape':
        setCommand('');
        break;
      case 'ArrowUp':
        if (historyIndex === history.length) {
          setTempInput(command);
        }
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1;
          setHistoryIndex(nextIndex);
          setCommand(history[nextIndex]);
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (historyIndex < history.length) {
          const nextIndex = historyIndex + 1;
          setHistoryIndex(nextIndex);
          if (nextIndex === history.length) {
            setCommand(tempInput);
          } else {
            setCommand(history[nextIndex]);
          }
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (!command) return;
        const candidates = [...simCommands.map(([cmd]) => cmd), ...metaCommands.map(([cmd]) => cmd)];
        const match = candidates.find((cmd) => cmd.startsWith(command));
        if (match) {
          setCommand(match);
        }
        break;
      default:
        break;
    }
  };

  const promptNode = useMemo(() => {
    if (sending) {
      return <span className="prompt">LOADING...</span>;
    }
    if (!name) {
      return <span className="prompt">Enter a Name to Simulate &gt;&gt;&gt;</span>;
    }
    return (
      <span className="prompt">
        <span className="prompt-user">{terminalConfig.username}</span>@
        <span className="prompt-host">{terminalConfig.hostname}</span>:$ ~
      </span>
    );
  }, [name, sending]);

  const renderPromptLine = (content: string, key: string) => (
    <p className="terminal-line" key={key}>
      <span className="prompt">
        <span className="prompt-user">{terminalConfig.username}</span>@
        <span className="prompt-host">{terminalConfig.hostname}</span>:$ ~
      </span>{' '}
      <span className="output">{content}</span>
    </p>
  );

  const renderMessageBlocks = () => {
    const sliced = messages.slice(clearAt);
    return sliced.map((msg, index) => {
      const labelClass = msg.is_user ? 'searcher' : 'simulator';
      const label = 'SIMULATOR CLAUDE:';
      const promptContent =
        msg.is_user && index === 0 && msg.content.startsWith('/locate ')
          ? msg.content.slice(8)
          : msg.content;

      return (
        <div className="terminal-block" key={msg.id || `${index}-${msg.content}`}> 
          {msg.is_user && renderPromptLine(promptContent, `prompt-${index}`)}
          <p className={`terminal-line ${labelClass}`}>{label}</p>
          <p className={`terminal-line ${labelClass}`}>{msg.content}</p>
        </div>
      );
    });
  };

  const renderHelp = (key?: string) => (
    <div className="terminal-block" key={key || 'help-block'}>
      {simCommands.map(([cmd, desc]) => (
        <div className="command-row" key={cmd}>
          <span className="command">{cmd}</span>
          <span>{desc}</span>
        </div>
      ))}
      <div className="terminal-line">&nbsp;</div>
      {metaCommands.map(([cmd, desc]) => (
        <div className="command-row" key={cmd}>
          <span className="command">{cmd}</span>
          <span>{desc}</span>
        </div>
      ))}
      <div className="terminal-line">&nbsp;</div>
      {keyHints.map(([keyLabel, desc]) => (
        <p className="terminal-line" key={keyLabel}>
          Press <span className="keys">{keyLabel}</span> {desc}
        </p>
      ))}
    </div>
  );

  const renderBanner = (key?: string) => (
    <div className="terminal-block banner" key={key || 'banner-block'}>
      {terminalConfig.ascii.map((line, idx) => (
        <pre key={idx}>{line}</pre>
      ))}
      <div className="terminal-line">&nbsp;</div>
      <div className="terminal-line">Welcome to {terminalConfig.title} {terminalConfig.version}</div>
    </div>
  );

  if (!ready) {
    return (
      <main>
        <div id="bars">
          <div id="bar-1">
            <div>YouSim.x64_x86</div>
          </div>
          <div id="bar-2"></div>
          <div id="bar-3"></div>
          <div id="bar-4"></div>
          <div id="bar-5"></div>
        </div>
        <div id="scroll-zone" ref={scrollRef}>
          <div id="terminal">
            <p className="terminal-line">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main onClick={() => inputRef.current?.focus()}>
      <div id="bars">
        <div id="bar-1">
          <div>YouSim.x64_x86</div>
          <div id="social-buttons">
            <a href="https://x.com/plastic_labs" target="_blank" rel="noreferrer">x</a>
            <a href="https://github.com/plastic-labs" target="_blank" rel="noreferrer">gh</a>
            <a href="https://discord.gg/plasticlabs" target="_blank" rel="noreferrer">dc</a>
          </div>
        </div>
        <div id="bar-2"></div>
        <div id="bar-3"></div>
        <div id="bar-4"></div>
        <div id="bar-5"></div>
      </div>

      <div id="scroll-zone" ref={scrollRef}>
        <div id="terminal">
          {showIntro && renderBanner()}
          {showIntro && renderHelp()}
          {extraSections.map((section) =>
            section.startsWith('banner') ? renderBanner(section) : renderHelp(section)
          )}
          {renderMessageBlocks()}
        </div>

        <div id="input-line">
          <div className="input-row">
            {promptNode}
            <input
              ref={inputRef}
              className="terminal-input"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default App;
