# Issue 008: Webshell Frontend Implementation

**Status:** Open
**Priority:** Medium
**Dependencies:** 007 (Complete API)
**Blocks:** None

## Description

Implement a web-based terminal interface (webshell) similar to the legacy webshell implementation. This provides a browser-based CLI experience that's more accessible than a terminal.

## Legacy Implementation

**Location:** `legacy-python/webshell/`

**Key Files:**
- `index.html` - Main page with terminal
- `src/main.ts` - Main application logic
- `src/sim.ts` - Simulation mode handling
- `src/honcho.ts` - API client
- `src/input.ts` - Terminal input handling
- `src/display.ts` - Terminal output handling
- `src/commands/*.ts` - Built-in commands (help, about, banner, etc.)
- `share.html` - View shared conversations

**Features:**
- Terminal-style interface with xterm.js
- Color-coded output (blue for searcher, yellow for simulator)
- Built-in commands (/help, /about, /login, /whoami, etc.)
- Authentication with Supabase
- Session management
- Share functionality

## Technology Stack

### Option A: Reuse Legacy Webshell (Update APIs)

**Pros:**
- Already built and tested
- Familiar interface
- Just needs API endpoints updated

**Cons:**
- Uses outdated dependencies
- Mixed with Honcho logic
- Vanilla TypeScript (no framework)

### Option B: New React Terminal Component

**Pros:**
- Integrates with existing React frontend
- Modern tooling (Vite, TypeScript, React Query)
- Reusable components

**Cons:**
- More work to build
- Need to find good terminal component
- Styling challenges

### Option C: Hybrid Approach

**Pros:**
- Keep webshell as standalone page
- Update dependencies and API calls
- Clean separation of concerns

**Cons:**
- Maintain two frontends

**Recommendation:** Option C (Hybrid) - Keep webshell separate but modernize it.

## Implementation Plan

### Phase 1: Project Setup

Create new webshell package in the monorepo:

```
frontend-webshell/
├── index.html
├── share.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── api/
│   │   └── client.ts      # API client for new endpoints
│   ├── terminal/
│   │   ├── input.ts
│   │   ├── output.ts
│   │   └── colors.ts
│   ├── modes/
│   │   ├── simulator.ts   # /manual and /auto modes
│   │   ├── constructor.ts # /constructor mode
│   │   └── chat.ts        # /chat mode
│   ├── commands/
│   │   ├── help.ts
│   │   ├── about.ts
│   │   ├── login.ts
│   │   ├── whoami.ts
│   │   └── clear.ts
│   └── auth/
│       └── supabase.ts
└── public/
    ├── logo.png
    └── banner.png
```

### Phase 2: Terminal Foundation

**Dependencies:**
```json
{
  "dependencies": {
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "@supabase/supabase-js": "^2.78.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Basic Terminal Setup:**
```typescript
// src/main.ts
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const terminal = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  theme: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff'
  }
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

terminal.open(document.getElementById('terminal')!);
fitAddon.fit();

// Handle window resize
window.addEventListener('resize', () => fitAddon.fit());
```

### Phase 3: API Client

**src/api/client.ts:**
```typescript
import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiClient {
  private supabase;
  private token: string | null = null;

  constructor() {
    this.supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_KEY
    );
  }

  async login(email: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  }

  async getSession(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    this.token = data.session?.access_token || null;
    return this.token;
  }

  async reset(sessionId?: string, mode?: string): Promise<any> {
    const res = await fetch(`${API_BASE}/reset?session_id=${sessionId || ''}&mode=${mode || ''}`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return res.json();
  }

  async manual(sessionId: string, command: string): Promise<ReadableStream> {
    const res = await fetch(`${API_BASE}/manual`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ session_id: sessionId, command })
    });
    return res.body!;
  }

  async auto(sessionId: string): Promise<ReadableStream> {
    const res = await fetch(`${API_BASE}/auto`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ session_id: sessionId })
    });
    return res.body!;
  }

  async constructor(sessionId: string, command: string): Promise<ReadableStream> {
    const res = await fetch(`${API_BASE}/constructor`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ session_id: sessionId, command })
    });
    return res.body!;
  }

  async chat(params: ChatParams): Promise<ReadableStream> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params)
    });
    return res.body!;
  }

  async getSessions(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sessions`, {
      headers: this.getHeaders()
    });
    return res.json();
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    };
  }
}
```

### Phase 4: Simulation Modes

**Simulator Mode (Default):**
```typescript
// src/modes/simulator.ts
export class SimulatorMode {
  constructor(
    private terminal: Terminal,
    private api: ApiClient,
    private sessionId: string
  ) {}

  async handleCommand(command: string) {
    if (command === '') {
      // Empty command = auto mode
      await this.runAuto();
    } else {
      // Manual command
      await this.runManual(command);
    }
  }

  private async runManual(command: string) {
    // Display user input in blue
    this.terminal.write(`\x1b[94m${command}\x1b[0m\r\n`);

    // Get response stream
    const stream = await this.api.manual(this.sessionId, command);

    // Display response in yellow
    this.terminal.write('\x1b[93m');
    await this.streamResponse(stream);
    this.terminal.write('\x1b[0m\r\n');
  }

  private async runAuto() {
    const stream = await this.api.auto(this.sessionId);

    // Display searcher in blue
    this.terminal.write('\x1b[94m');
    await this.streamResponse(stream);
    this.terminal.write('\x1b[0m\r\n');
  }

  private async streamResponse(stream: ReadableStream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      this.terminal.write(text);
    }
  }
}
```

**Constructor Mode:**
```typescript
// src/modes/constructor.ts
export class ConstructorMode {
  constructor(
    private terminal: Terminal,
    private api: ApiClient,
    private sessionId: string
  ) {}

  async start() {
    // Initial greeting
    this.terminal.write('Welcome to Identity Constructor!\r\n');
    this.terminal.write('I will help you build a custom identity.\r\n\r\n');
  }

  async handleCommand(command: string) {
    // Display user input
    this.terminal.write(`\x1b[96m${command}\x1b[0m\r\n`);

    // Get constructor response
    const stream = await this.api.constructor(this.sessionId, command);

    // Display response
    this.terminal.write('\x1b[92m');
    await this.streamResponse(stream);
    this.terminal.write('\x1b[0m\r\n');
  }

  private async streamResponse(stream: ReadableStream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      this.terminal.write(text);
    }
  }
}
```

### Phase 5: Built-in Commands

```typescript
// src/commands/index.ts
export interface Command {
  name: string;
  description: string;
  execute: (args: string[], terminal: Terminal) => Promise<void>;
}

export const commands: Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    execute: async (args, terminal) => {
      terminal.write('Available commands:\r\n');
      commands.forEach(cmd => {
        terminal.write(`  /${cmd.name} - ${cmd.description}\r\n`);
      });
    }
  },
  {
    name: 'clear',
    description: 'Clear the terminal',
    execute: async (args, terminal) => {
      terminal.clear();
    }
  },
  {
    name: 'about',
    description: 'About YouSim',
    execute: async (args, terminal) => {
      terminal.write('YouSim - Identity Simulation in the Latent Space\r\n');
      terminal.write('https://yousim.ai\r\n');
    }
  },
  {
    name: 'login',
    description: 'Login with email',
    execute: async (args, terminal) => {
      const email = args[0];
      if (!email) {
        terminal.write('Usage: /login <email>\r\n');
        return;
      }
      terminal.write(`Sending magic link to ${email}...\r\n`);
      // Handle login
    }
  },
  {
    name: 'projects',
    description: 'List your sessions',
    execute: async (args, terminal) => {
      // List sessions
    }
  }
];
```

### Phase 6: Share Page

**share.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Shared Conversation - YouSim</title>
  <link rel="stylesheet" href="/src/style.css">
</head>
<body>
  <div id="terminal"></div>
  <script type="module" src="/src/share.ts"></script>
</body>
</html>
```

**src/share.ts:**
```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

const terminal = new Terminal();
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.getElementById('terminal')!);
fitAddon.fit();

// Get share code from URL
const params = new URLSearchParams(window.location.search);
const code = params.get('code');

if (code) {
  // Fetch shared messages
  const res = await fetch(`${API_BASE}/share/messages/${code}`);
  const data = await res.json();

  // Display messages
  data.messages.forEach((msg: any) => {
    const color = msg.is_user ? '\x1b[94m' : '\x1b[93m';
    terminal.write(`${color}${msg.content}\x1b[0m\r\n\r\n`);
  });
} else {
  terminal.write('Invalid share code\r\n');
}
```

## Environment Configuration

**frontend-webshell/.env:**
```bash
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_KEY=your_supabase_key
```

## Styling

Use the legacy webshell CSS as a starting point:
- Dark terminal background
- Monospace font
- Proper terminal styling
- Responsive design

## Deployment

### Development
```bash
cd frontend-webshell
bun install
bun run dev
```

### Production
```bash
bun run build
# Deploy dist/ folder to hosting
```

## Acceptance Criteria

- [ ] Webshell package created in monorepo
- [ ] Terminal interface working (xterm.js)
- [ ] Authentication with Supabase
- [ ] Simulator mode working (/manual and /auto)
- [ ] Constructor mode working
- [ ] Chat mode working
- [ ] Built-in commands implemented
- [ ] Share page working
- [ ] Responsive design
- [ ] Color-coded output
- [ ] Session management
- [ ] Error handling
- [ ] Loading states

## Testing

1. Open webshell in browser
2. Login with email
3. Start simulator session
4. Send manual commands
5. Try auto mode (empty command)
6. Start constructor session
7. Complete constructor flow
8. Start chat with identity
9. Test share functionality
10. Test on mobile devices

## References

- Legacy webshell: `legacy-python/webshell/`
- xterm.js: https://xtermjs.org/
- Vite: https://vitejs.dev/
- Supabase Auth: https://supabase.com/docs/guides/auth

## Future Enhancements

- [ ] Syntax highlighting for commands
- [ ] Command history (up/down arrows)
- [ ] Tab completion
- [ ] Copy/paste support
- [ ] Export conversation from terminal
- [ ] Keyboard shortcuts
- [ ] Theme customization
- [ ] Mobile-optimized touch interface
