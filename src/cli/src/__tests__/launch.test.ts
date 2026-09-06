/**
 * What a first-time user actually does.
 *
 * `src/cli` had no tests at all across ~960 lines — the REPL, the modes, the
 * recorder, and the launch path. That is where the meta-command regression
 * lived: `parseInput` and the registry were unit-tested and correct, while
 * being unreachable at the only prompt anyone sees on launch. Testing the
 * parts proved the parts worked, and these are what proves the launch path
 * still reaches them.
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
   * The name prompt is a prompt, not a gate.
   *
   * This is the case the whole registry exists for: the launch prompt is the
   * only one a new user has seen, so it is where they reach for `help`. Every
   * line typed there goes through `parseInput` first and becomes an identity
   * name only by falling through — the arrangement the original had, where one
   * dispatcher handled every line and naming was its last branch.
   *
   * Both directions are asserted. `help` printing is not enough on its own:
   * the failure being guarded is the input *also* being taken as a name, which
   * would show up as `/locate help` in the transcript.
   */
  test("`help` at the name prompt dispatches instead of becoming a name", async () => {
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

  /**
   * Dispatching at the launch prompt means commands now run with no session
   * behind them. They have to say so and hand the prompt back — throwing there
   * would take down the process at the one moment a new user is exploring.
   */
  test("commands that need a session report it plainly at the name prompt", async () => {
    const pty = launchPty();
    try {
      await pty.expect(/Enter a name:/);
      pty.send("export");
      await pty.expect(/nothing to export yet/);
      pty.send("reset");
      await pty.expect(/no session to reset yet/);
      // Still at the prompt, so a name still works after the refusals.
      pty.send("ada");
      await pty.expect(takenAsName("ada"));
    } finally {
      await pty.close();
    }
  });

  /**
   * The dispatcher exact-matches the first token, so a name that merely starts
   * with a command's letters is still a name. `chateau ruins` is the case that
   * named this rule — the original's `startsWith("chat")` swallowed it. This
   * registry has no `chat`, so `modest mouse` is checked alongside it: `mode`
   * is a live command here, which makes the assertion able to fail if prefix
   * matching ever comes back.
   */
  test("a name that shadows a command prefix still reaches the simulator", async () => {
    for (const name of ["chateau ruins", "modest mouse"]) {
      const pty = launchPty();
      try {
        await pty.expect(/Enter a name:/);
        pty.send(name);
        await pty.expect(takenAsName(name));
      } finally {
        await pty.close();
      }
    }
  });
});
