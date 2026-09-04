import {
  beginAuth,
  exchangeCode,
  saveCredential,
  forgetCredential,
  listCredentials,
  credentialsPath,
} from "@yousim/core";
import * as readline from "readline";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

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

/**
 * Report where the key actually went. saveCredential prefers the OS keychain
 * and falls back to a file, so claiming a file path unconditionally is wrong
 * whenever the keychain accepted it.
 */
function describeStorage(where: "keychain" | "file"): string {
  return where === "keychain"
    ? "Key stored in the system keychain."
    : `Key stored in ${credentialsPath()} (0600).`;
}

async function openBrowser(url: string): Promise<boolean> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  // `node:child_process` rather than `Bun.spawn`, so this one function serves
  // both runtimes. The failure path needs care in the translation: Bun.spawn
  // *throws* when the binary is missing, so a `try`/`catch` was enough, but
  // node reports it through an "error" event on the child and a throw would
  // never happen — leaving the promise pending forever, and the process with
  // an unhandled error. Hence the explicit listener.
  //
  // A missing binary is the normal case on Windows, where `start` is a cmd.exe
  // builtin and not an executable at all. Returning false is the whole
  // contract here: the caller prints the URL for the user to open themselves.
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(cmd, [url], { stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
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
  console.log(`\nConnected. ${describeStorage(saveCredential(PROVIDER, key))}`);
}

export async function connect(opts: { headless?: boolean } = {}): Promise<void> {
  if (opts.headless) return connectHeadless();

  let resolveCode: (code: string) => void;
  let rejectCode: (err: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  // `node:http` rather than `Bun.serve`, so one listener serves both runtimes.
  //
  // Bound to 127.0.0.1 explicitly. `Bun.serve` with no hostname binds the
  // wildcard, which put a listener that accepts an OAuth code onto every
  // interface for the duration of the flow. Only this machine's browser is
  // ever supposed to reach it, and loopback is what the redirect URL below
  // already promises.
  const server = createServer((req, res) => {
    // `req.url` is a path, not an absolute URL, so it needs a base to parse
    // against. The base is discarded — only the query is read.
    const code = new URL(req.url ?? "/", "http://localhost").searchParams.get("code");
    if (!code) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Waiting for an authorization code…");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta charset="utf-8">
       <title>Connected</title>
       <body style="font:14px system-ui;padding:3rem;max-width:32rem">
         <h1>Connected</h1>
         <p>Your OpenRouter account is linked. You can close this tab and return to the terminal.</p>
       </body>`
    );
    resolveCode(code);
  });

  // Port 0 gets an ephemeral port, but the number is only knowable once the
  // socket is listening — and OpenRouter needs the exact callback URL up
  // front, so the flow cannot start before this resolves.
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });

  const callbackUrl = `http://localhost:${port}/callback`;

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
    console.log(`Connected. ${describeStorage(saveCredential(PROVIDER, key))}`);
  } finally {
    // `closeAllConnections` before `close`, which is what `Bun.serve`'s
    // `stop(true)` did in one call. `close()` alone only stops *accepting*:
    // the browser's keep-alive connection stays open and holds the event loop,
    // so `yousim connect` would print "Connected." and then hang.
    server.closeAllConnections();
    server.close();
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
