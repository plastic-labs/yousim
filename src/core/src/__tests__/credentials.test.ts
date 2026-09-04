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
// every test here runs against the file store only. Without this the suite
// writes test values into the developer's real login keychain.
process.env.YOUSIM_KEYCHAIN = "0";

let home: string | undefined;
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  delete process.env.YOUSIM_HOME;
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
