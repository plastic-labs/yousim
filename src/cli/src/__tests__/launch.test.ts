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
import { fakeProviderEnv, startFakeProvider } from "./fake-provider";

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

/**
 * Commands that announce a switch have to perform one.
 *
 * `mode <x>` and `sessions <id>` set a request and return `exit: true`, because
 * switching rebuilds the agents and the current loop has to unwind first. For
 * as long as nothing read those requests, the unwinding *was* the whole
 * behaviour: the user got a confirmation line and then a shell prompt.
 *
 * Every test here asserts on **reaching the next prompt**, never on the
 * confirmation. Printing the confirmation is precisely what the broken version
 * already did, so an assertion on that text passes either way.
 */
describe.skipIf(!!skip)("switching mode and session", () => {
  /** Get to the in-session command prompt. The model call fails; the loop lives. */
  const named = async (pty: ReturnType<typeof launchPty>) => {
    await pty.expect(/Enter a name:/);
    pty.send("ada");
    await pty.expect(/No API key for provider/);
  };

  test("`mode constructor` lands in the constructor, not in a shell", async () => {
    const pty = launchPty();
    try {
      await named(pty);
      pty.send("mode constructor");
      await pty.expect(/What name should this identity have\?/);
    } finally {
      await pty.close();
    }
  });

  test("`mode chat` lands in chat", async () => {
    const pty = launchPty();
    try {
      await named(pty);
      pty.send("mode chat");
      await pty.expect(/Paste or type the identity summary/);
    } finally {
      await pty.close();
    }
  });

  /**
   * `reset` is the sibling that must *not* unwind: it swaps the recorder in
   * place, so there is nothing to re-enter. It used to return `exit: true` too,
   * which quit while claiming to have started a new session.
   */
  test("`reset` starts a new session and stays in it", async () => {
    const pty = launchPty();
    try {
      await named(pty);
      pty.send("reset");
      await pty.expect(/New session\./);
      // The proof is that the prompt still answers, not that it printed.
      pty.send("mode");
      await pty.expect(/current mode: simulator/);
    } finally {
      await pty.close();
    }
  });

  /**
   * The id comes out of the live listing rather than being fabricated: it is
   * the abbreviated form `sessions` actually prints, which is the form
   * `expandSessionId` has to accept.
   */
  test("`sessions <id>` reopens the session instead of quitting", async () => {
    const pty = launchPty();
    try {
      await named(pty);
      pty.send("sessions");
      await pty.expect(/Saved sessions/);

      const id = pty.transcript().match(/^ {2}([0-9a-f]{8}) {2}/m)?.[1];
      expect(id).toBeTruthy();

      pty.send(`sessions ${id}`);
      // `Resuming` is printed only on the resume path, so seeing it means the
      // loop re-entered rather than ended.
      await pty.expect(/Resuming "ada"/);

      // But that banner prints *before* the resumed session takes input, so on
      // its own it cannot tell a live prompt from a replay that then exited.
      // Drive one command through to settle it. Asserting on the prompt string
      // would not: it is already in the transcript twice by this point, so it
      // would match whatever happened here.
      pty.send("mode");
      await pty.expect(/current mode: simulator/);
    } finally {
      await pty.close();
    }
  });

  /**
   * `reset` swaps the recorder, and that is the visible half. The other half is
   * the agent histories: leaving them in place produced a "new session" that
   * kept replaying the old conversation into every prompt while writing to a
   * file that claimed to be fresh.
   *
   * Nothing in the transcript shows this — a stale history is only visible in
   * what leaves the process. Hence the loopback provider; see `fake-provider.ts`
   * for why that does not weaken the offline guarantee.
   */
  test("`reset` clears what the model sees, not just the file", async () => {
    const fake = startFakeProvider();
    const pty = launchPty([], fakeProviderEnv(fake));
    try {
      await pty.expect(/Enter a name:/);

      // A distinct reply per turn, so waiting for one cannot match an earlier
      // one still sitting in the transcript.
      fake.reply = "ALPHA";
      pty.send("ada");
      await pty.expect(/ALPHA/);

      fake.reply = "BETA";
      pty.send("describe your childhood");
      await pty.expect(/BETA/);

      // Precondition: without it, the assertion below would also pass on a
      // build that never sent any history at all.
      const before = fake.calls[fake.calls.length - 1]!.messages;
      expect(before.map((m) => m.content).join("\n")).toContain("childhood");

      pty.send("reset");
      await pty.expect(/New session\./);

      fake.reply = "GAMMA";
      pty.send("who are you");
      await pty.expect(/GAMMA/);

      const after = fake.calls[fake.calls.length - 1]!.messages;
      const sent = after.map((m) => m.content).join("\n");
      expect(sent).toContain("who are you");
      expect(sent).not.toContain("childhood");
      expect(sent).not.toContain("ALPHA");
      expect(sent).not.toContain("BETA");
    } finally {
      await pty.close();
      fake.stop();
    }
  });
});
