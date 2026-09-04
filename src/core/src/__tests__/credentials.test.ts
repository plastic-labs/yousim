import { expect, test, afterEach } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveCredential,
  loadCredential,
  forgetCredential,
  listCredentials,
  credentialsPath,
} from "../credentials";

// The keychain is machine-global and cannot be isolated with YOUSIM_HOME, so
// every test here runs against the file store only. Without that guard this
// suite writes test values into the developer's real login keychain, which is
// not hypothetical — it happened.
//
// The guard is NOT set here any more. scripts/hermetic.ts sets it in the
// environment before Bun starts, because an assignment at the top of a test
// file runs after every static import in the module graph. Today nothing reads
// a credential at load time; the day something does, a line here would be too
// late, and its presence would hide that it was too late.
//
// So this asserts instead of assigning. A run that reaches this without the
// guard already in the environment must stop, not quietly protect itself.
if (process.env.YOUSIM_KEYCHAIN !== "0") {
  throw new Error(
    "refusing to run: YOUSIM_KEYCHAIN=0 was not set before Bun started. " +
      "Use `bun run test` (scripts/hermetic.ts) rather than `bun test` directly."
  );
}

// Captured before any test redirects it, and restored below rather than
// deleted. Whether that matters is platform-dependent, which is why it looks
// like dead hygiene: on macOS and Linux, Bun 1.3.6 gives each test file its own
// view of process.env, so a delete here cannot escape this file. On the
// windows-latest runner, on the same Bun version, it can and does — leaving
// YOUSIM_HOME deleted un-isolates every file that runs after this one, and
// no-live-calls.test.ts > "the run is isolated from the real home" fails there
// while passing locally. Restore, don't delete.
const hermeticHome = process.env.YOUSIM_HOME;

let home: string | undefined;
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  hermeticHome === undefined
    ? delete process.env.YOUSIM_HOME
    : (process.env.YOUSIM_HOME = hermeticHome);
  home = undefined;
});
function isolate() {
  home = mkdtempSync(join(tmpdir(), "yousim-cred-"));
  process.env.YOUSIM_HOME = home;
}

test("a saved credential round-trips", () => {
  isolate();
  saveCredential("openrouter", "sk-or-secret");
  expect(loadCredential("openrouter")).toBe("sk-or-secret");
});

test("the credentials file is 0600, not world-readable", () => {
  isolate();
  saveCredential("openrouter", "sk-or-secret");
  const mode = statSync(credentialsPath()).mode & 0o777;
  expect(mode).toBe(0o600);
});

test("env wins over a stored key, so overrides need no disconnect", () => {
  isolate();
  saveCredential("openrouter", "stored");
  const saved = process.env.TEST_OR_KEY;
  process.env.TEST_OR_KEY = "from-env";
  try {
    expect(loadCredential("openrouter", "TEST_OR_KEY")).toBe("from-env");
    expect(loadCredential("openrouter")).toBe("stored");
  } finally {
    saved === undefined ? delete process.env.TEST_OR_KEY : (process.env.TEST_OR_KEY = saved);
  }
});

test("forget removes only the named provider", () => {
  isolate();
  saveCredential("openrouter", "a");
  saveCredential("other", "b");
  forgetCredential("openrouter");
  expect(loadCredential("openrouter")).toBeUndefined();
  expect(loadCredential("other")).toBe("b");
});

test("missing or corrupt store reads as empty rather than throwing", () => {
  isolate();
  expect(loadCredential("openrouter")).toBeUndefined();
  expect(listCredentials()).toEqual([]);
  Bun.write(credentialsPath(), "{ not json");
  expect(loadCredential("openrouter")).toBeUndefined();
});

test("the key itself is never included in a listing", () => {
  isolate();
  saveCredential("openrouter", "sk-or-secret");
  expect(JSON.stringify(listCredentials())).not.toContain("sk-or-secret");
});
