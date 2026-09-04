/**
 * Drive the CLI through a pseudo-terminal.
 *
 * Every other subprocess test in this repo spawns something non-interactive —
 * the API server, the installed binary with `config` or `--help`, `tar`. None
 * of them types at a prompt, and that gap is not academic: the meta-command
 * registry was unit-tested and correct while being unreachable at the only
 * prompt a new user sees, because nothing exercised the launch path.
 *
 * A pipe cannot substitute. Readline is created with `terminal: true`, which
 * changes how it reads: piping three lines delivers all of them to the *first*
 * prompt at once and the loop never reads them individually, then the process
 * dies with `readline was closed`. A piped test reports nonsense rather than a
 * failure, which is worse than having no test.
 *
 * So: a real pty, allocated by `pty-driver.py` — see that file for why it is a
 * Python stdlib script rather than `script(1)`, which cannot be driven from a
 * Bun test at all. Windows has no equivalent; `ptyReason()` explains the skip,
 * and a skip there is a real coverage hole rather than a pass.
 */

import { hermeticEnv } from "../../../../scripts/hermetic";

const LAUNCHER = new URL("../../../launcher/src/index.ts", import.meta.url).pathname;

/** Terminal escapes and carriage returns, which the themed writer emits freely. */
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b[()][AB012]|\r/g;

export const stripAnsi = (s: string) => s.replace(ANSI, "");

/**
 * Why a pty is unavailable here, or null when it is.
 *
 * Returned rather than thrown so a caller can `test.skipIf` on it *and* print
 * the reason. A silently skipped interactive test reads as a passing one.
 */
export function ptyReason(): string | null {
  if (process.platform === "win32") {
    return "no pty on Windows; the launch path is unexercised there";
  }
  if (!Bun.which("python3")) {
    return "python3 not found; pty-driver.py cannot allocate a terminal";
  }
  return null;
}

const DRIVER = new URL("./pty-driver.py", import.meta.url).pathname;

export interface Pty {
  /** Wait until the transcript so far matches. Rejects with it on timeout. */
  expect(pattern: RegExp, timeoutMs?: number): Promise<void>;
  /** Type a line, as a user would. */
  send(line: string): void;
  /** Everything seen so far, ANSI-stripped. */
  transcript(): string;
  /** Stop the process and resolve its exit code. */
  close(): Promise<number | null>;
}

/**
 * Launch the CLI under a pty in a hermetic environment.
 *
 * No credential is provided, deliberately: with none, the provider resolver
 * throws locally instead of making a network call, so these tests are fast and
 * offline and still reach the command loop. The missing-credential error *is*
 * the path a first-time user takes.
 */
export function launchPty(args: string[] = [], extraEnv: Record<string, string> = {}) {
  const { env, cleanup } = hermeticEnv(extraEnv);

  const proc = Bun.spawn(["python3", DRIVER, process.execPath, "--no-env-file", LAUNCHER, ...args], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  let buffer = "";
  let closed = false;

  // Drain continuously rather than on demand. `script` relays a pty, so a
  // stalled reader can block the child on a full pipe and look like a hang in
  // the code under test.
  //
  // stderr is folded into the same transcript on purpose. A pty test that dies
  // early is useless if the reason went to a stream nobody read — which is
  // exactly how the first version of this helper wasted a debugging cycle.
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) buffer += stripAnsi(decoder.decode(value, { stream: true }));
    }
  };
  const drain = Promise.all([pump(proc.stdout), pump(proc.stderr)]).catch(() => {
    /* closed underneath us; `expect` reports the real failure */
  });

  const pty: Pty = {
    transcript: () => buffer,

    send(line) {
      proc.stdin.write(`${line}\n`);
      proc.stdin.flush();
    },

    async expect(pattern, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (pattern.test(buffer)) return;
        if (closed || proc.exitCode !== null) {
          // Drain before judging. A command that prints and immediately exits
          // is a legitimate outcome, and checking exitCode first would report
          // "exited before matching" for output already in flight — which is a
          // false negative that looks exactly like the bug under test.
          await drain;
          if (pattern.test(buffer)) return;
          throw new Error(
            `process exited (${proc.exitCode}) before matching ${pattern}\n` +
              `--- transcript ---\n${buffer}`
          );
        }
        await Bun.sleep(50);
      }
      await drain;
      if (pattern.test(buffer)) return;
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${pattern}\n` +
        `--- transcript ---\n${buffer}`);
    },

    async close() {
      closed = true;
      try {
        proc.stdin.end();
      } catch {
        /* already gone */
      }
      proc.kill();
      const code = await proc.exited;
      await drain;
      cleanup();
      return code;
    },
  };

  return pty;
}
