import {
  beginAuth,
  exchangeCode,
  saveCredential,
  forgetCredential,
  listCredentials,
  credentialsPath,
} from "@yousim/core";
import * as readline from "readline";

/**
 * Connect an OpenRouter account via OAuth PKCE.
 *
 * Two paths, because a CLI can't assume a browser on the same machine:
 *   - local:    listen on an ephemeral port, open a browser, catch the redirect
 *   - headless: print the URL, user pastes the code back (SSH, containers)
 *
 * The key OpenRouter issues belongs to the user. We store it 0600 and never
 * transmit it anywhere except OpenRouter.
 */

const PROVIDER = "openrouter";

async function openBrowser(url: string): Promise<boolean> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const proc = Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (a) => (rl.close(), resolve(a.trim()))));
}

async function connectHeadless(): Promise<void> {
  const { url, verifier } = await beginAuth({ keyLabel: "yousim-cli" });

  console.log("\nOpen this URL, authorize, then paste the code you're shown:\n");
  console.log(`  ${url}\n`);

  const code = await ask("Code: ");
  if (!code) {
    console.log("Cancelled.");
    return;
  }

  const key = await exchangeCode(code, verifier);
  saveCredential(PROVIDER, key);
  console.log(`\nConnected. Key stored in ${credentialsPath()} (0600).`);
}

export async function connect(opts: { headless?: boolean } = {}): Promise<void> {
  if (opts.headless) return connectHeadless();

  // Bind port 0 to get an ephemeral one, then build the callback from the port
  // we actually got — OpenRouter needs the exact URL up front.
  let resolveCode: (code: string) => void;
  let rejectCode: (err: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const code = new URL(req.url).searchParams.get("code");
      if (!code) {
        return new Response("Waiting for an authorization code…", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      resolveCode(code);
      return new Response(
        `<!doctype html><meta charset="utf-8">
         <title>Connected</title>
         <body style="font:14px system-ui;padding:3rem;max-width:32rem">
           <h1>Connected</h1>
           <p>Your OpenRouter account is linked. You can close this tab and return to the terminal.</p>
         </body>`,
        { headers: { "Content-Type": "text/html" } }
      );
    },
  });

  const callbackUrl = `http://localhost:${server.port}/callback`;

  try {
    const { url, verifier } = await beginAuth({ callbackUrl });

    console.log("\nOpening your browser to authorize OpenRouter…");
    const opened = await openBrowser(url);
    if (!opened) {
      console.log("Couldn't open a browser. Open this URL yourself:\n");
      console.log(`  ${url}\n`);
    }
    console.log(`Waiting for the redirect on ${callbackUrl}`);
    console.log("(Ctrl+C to cancel, or run `yousim connect --headless` to paste a code instead)\n");

    // Don't hang forever if the user abandons the browser tab.
    const timeout = setTimeout(
      () => rejectCode(new Error("Timed out after 5 minutes waiting for authorization.")),
      5 * 60 * 1000
    );

    const code = await codePromise.finally(() => clearTimeout(timeout));
    const key = await exchangeCode(code, verifier);
    saveCredential(PROVIDER, key);
    console.log(`Connected. Key stored in ${credentialsPath()} (0600).`);
  } finally {
    server.stop(true);
  }
}

export async function disconnect(): Promise<void> {
  const before = listCredentials();
  if (!before.some((c) => c.provider === PROVIDER)) {
    console.log("No OpenRouter key is connected.");
    return;
  }
  forgetCredential(PROVIDER);
  console.log("Disconnected. Revoke it fully at https://openrouter.ai/settings/keys");
}

export function connectionStatus(): void {
  const creds = listCredentials();
  if (creds.length === 0) {
    console.log("No account connected. Run: yousim connect");
    return;
  }
  console.log(`Credentials (${credentialsPath()}):`);
  for (const c of creds) {
    console.log(`  ${c.provider}  connected ${c.connected_at.slice(0, 16).replace("T", " ")}`);
  }
}
