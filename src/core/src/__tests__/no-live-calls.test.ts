/**
 * The suite must be runnable by anyone, on any machine, with no account.
 *
 * Every test in this repo asserts against a *failure* path when a credential
 * is missing — that is deliberate, and it is what makes `bun run test` free
 * and offline. The risk is drift: someone exports ANTHROPIC_API_KEY in their
 * shell, writes a test that quietly succeeds because a real model answered,
 * and CI then fails for everyone else with no key (or, worse, passes on a
 * runner that has one and bills for it).
 *
 * scripts/hermetic.ts strips provider credentials from the child environment
 * to prevent that. This asserts the stripping actually happened, so a test
 * that needs a live credential cannot land in the default path by accident.
 *
 * A test that genuinely needs one goes behind `bun run test:live`, which sets
 * YOUSIM_LIVE=1 and leaves the environment alone. There are none today.
 */

import { expect, test } from "bun:test";
import { CWD_ENV_KEYS } from "../config";

const LIVE = process.env.YOUSIM_LIVE === "1";

test.skipIf(LIVE)("no provider credential is visible to the test run", () => {
  const present = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
  ].filter((k) => process.env[k]);

  expect(present).toEqual([]);
});

test.skipIf(LIVE)("no endpoint override is visible to the test run", () => {
  // An endpoint override is the other half: it would send a made-up key
  // somewhere real, or send a real key somewhere unexpected.
  expect(process.env.OPENAI_BASE_URL).toBeUndefined();
  expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
});

test("the run is isolated from the real home", () => {
  // Not credential-specific, but the same class of assertion. It had teeth for
  // a concrete reason: `yousim config` used to perform a filesystem migration
  // out of os.homedir()/.yousim on every invocation, so a run whose HOME was
  // the developer's own could move their credential. That migration is gone
  // (see launcher/__tests__/config-is-read-only.test.ts), but isolating HOME
  // is still the assertion that stops the next such bug being expensive.
  expect(process.env.YOUSIM_HOME).toBeDefined();
  expect(process.env.YOUSIM_KEYCHAIN).toBe("0");
  expect(process.env.YOUSIM_HOME).not.toContain("/.yousim");
});

test("the scrub list covers every variable the package reads", () => {
  // hermetic.ts strips CWD_ENV_KEYS rather than its own copy of the list. If a
  // new credential or endpoint variable is added to the package, it lands in
  // that list and is scrubbed for free — this asserts the list is still the
  // one being maintained.
  for (const key of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "OPENAI_BASE_URL",
  ]) {
    expect(CWD_ENV_KEYS).toContain(key);
  }
});
