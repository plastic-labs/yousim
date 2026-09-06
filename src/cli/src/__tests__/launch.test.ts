/**
 * What a first-time user actually does.
 *
 * `src/cli` had no tests at all across ~960 lines — the REPL, the modes, the
 * recorder, and the launch path. That is where the meta-command regression
 * lived: `parseInput` and the registry were unit-tested and correct, while
 * being unreachable at the only prompt anyone sees on launch. Testing the
 * parts proved the parts worked.
 *
 * These drive the real thing through a pty. See `pty.ts` for why a pipe cannot.
 */

import { describe, expect, test } from "bun:test";
import { launchPty, ptyReason } from "./pty";

const skip = ptyReason();
if (skip) console.warn(`launch.test.ts: SKIPPED — ${skip}`);

/** Anything the registry prints; `help` renders from the live command list. */
const HELP_OUTPUT = /switch mode: mode <simulator/;

/**
 * The client prefixes bare first input with `/locate` in simulator mode, so
 * `/locate help` means "help" was taken as an identity name rather than
 * dispatched.
 *
 * Must be specific to the echoed input. A bare `/locate ` also appears in the
 * startup banner, where the simulator lists its own commands ("/locate -
 * pinpoint an identity in the latent space") — matching that made the assertion
 * below fail unconditionally, so the test passed whether or not the bug
 * existed. Caught by mutation-testing the harness rather than by reading it.
 */
const takenAsName = (input: string) => new RegExp(`/locate ${input}\\b`);

describe.skipIf(!!skip)("the launch path", () => {
  test("reaches the name prompt with no credential and no network", async () => {
    const pty = launchPty();
    try {
      await pty.expect(/Enter a name:/);
    } finally {
      await pty.close();
    }
  });

  // This is the harness proving itself. If the two in-session tests below pass
  // while the launch-prompt one fails, the difference is the code, not the pty.
  test("after naming an identity, `help` prints the registry", async () => {
    const pty = launchPty();
    try {
      await pty.expect(/Enter a name:/);
      pty.send("ada");
      // No credential, so the model call fails locally and immediately. That
      // error is the path a first-time user takes, and the loop starts after it.
      await pty.expect(/No API key for provider/);
      pty.send("help");
      await pty.expect(HELP_OUTPUT);
    } finally {
      await pty.close();
    }
  });

  test("after naming an identity, `mode` reports the current mode", async () => {
    const pty = launchPty();
    try {
      await pty.expect(/Enter a name:/);
      pty.send("ada");
      await pty.expect(/No API key for provider/);
      pty.send("mode");
      await pty.expect(/current mode: simulator/);
    } finally {
      await pty.close();
    }
  });

  /**
   * KNOWN BROKEN, and deliberately written to invert.
   *
   * `help` at the name prompt becomes an identity named "help". The prompt at
   * `cli.ts` reads raw and special-cases only `exit`; `parseInput` never runs,
   * so the registry is unreachable at the one moment a new user reaches for it.
   *
   * `test.failing` rather than a comment saying "expected to fail": this passes
   * while the bug exists and **fails the moment it is fixed**, which forces the
   * marker to be removed. Two comments claiming an expected failure were left
   * sitting on passing tests in this repo already; a reader trusted them and
   * had to re-derive the truth. A marker that cannot rot is worth more than one
   * that is currently accurate.
   */
  test.failing("`help` at the name prompt dispatches instead of becoming a name", async () => {
    const pty = launchPty();
    try {
      await pty.expect(/Enter a name:/);
      pty.send("help");
      // Whichever happens first — the registry, or the input being swallowed.
      await pty.expect(new RegExp(`${HELP_OUTPUT.source}|${takenAsName("help").source}`));
      expect(pty.transcript()).not.toMatch(takenAsName("help"));
      expect(pty.transcript()).toMatch(HELP_OUTPUT);
    } finally {
      await pty.close();
    }
  });
});
