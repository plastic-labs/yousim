/**
 * Meta-command classification and registry.
 *
 * The original dispatched with an ordered chain of `startsWith` checks on raw
 * input (legacy webshell input.ts). Slash-prefixed text reached the model only
 * because nothing in the chain matched it — the `/` was the simulator's own
 * grammar showing through, never a client-side classifier.
 *
 * Two things are kept from that, and one bug is not:
 *
 *   kept  — bare words are commands, no prefix ceremony
 *   kept  — anything unrecognized goes to the model untouched
 *   fixed — `startsWith` swallowed real input: `startsWith("chat")` matches
 *           "chateau", so an identity named "chateau ruins" triggered the chat
 *           command instead of a simulation. Match the first token exactly.
 *
 * `parseInput` is contract: both the CLI and the web UI must classify input
 * identically, or the same text behaves differently depending on where it was
 * typed. The *registry* is per-surface — a browser can't open a localhost
 * listener, a local CLI has no accounts to log into.
 */

export type ParsedInput =
  | { kind: "meta"; name: string; args: string[]; raw: string }
  | { kind: "simulation"; text: string }
  | { kind: "auto" };

export interface MetaCommand {
  name: string;
  /** Shown by `help`, which renders from the registry — so it cannot lie. */
  description: string;
  /** Extra names that dispatch here, e.g. `sessions` for `session`. */
  aliases?: string[];
  run(args: string[]): Promise<MetaCommandResult> | MetaCommandResult;
}

export interface MetaCommandResult {
  /** Text to show the user. */
  output?: string;
  /** Leave the current session loop (e.g. `exit`, or switching sessions). */
  exit?: boolean;
  /** Wipe the display without touching the session. */
  clear?: boolean;
}

/**
 * Classify one line of input.
 *
 * `names` is the surface's registry keys, so classification follows what that
 * surface can actually do rather than a hardcoded list.
 */
export function parseInput(input: string, names: Iterable<string>): ParsedInput {
  const raw = input;
  const trimmed = input.trim();

  // Empty means "let the searcher pick the next command" — the original's
  // [Enter] behavior.
  if (trimmed === "") return { kind: "auto" };

  // Never intercept simulation commands. The original didn't need this rule
  // because no meta-command started with "/", but being explicit means adding
  // a command can't accidentally shadow the simulator's grammar.
  if (trimmed.startsWith("/")) return { kind: "simulation", text: raw };

  const [head, ...args] = trimmed.split(/\s+/);
  const name = head!.toLowerCase();
  for (const candidate of names) {
    if (candidate === name) return { kind: "meta", name, args, raw };
  }

  return { kind: "simulation", text: raw };
}

/** Index a registry by name and alias, rejecting collisions. */
export function buildRegistry(commands: MetaCommand[]): Map<string, MetaCommand> {
  const map = new Map<string, MetaCommand>();
  for (const cmd of commands) {
    for (const key of [cmd.name, ...(cmd.aliases ?? [])]) {
      const lower = key.toLowerCase();
      if (map.has(lower)) {
        // A silent overwrite means one command shadows another depending on
        // registration order, which is the sort of bug that only shows up for
        // a user typing the wrong one.
        throw new Error(
          `Duplicate meta-command "${lower}": ${map.get(lower)!.name} and ${cmd.name}`
        );
      }
      map.set(lower, cmd);
    }
  }
  return map;
}

/** Render `help` from the live registry, so it can't advertise what doesn't exist. */
export function renderHelp(registry: Map<string, MetaCommand>): string {
  const seen = new Set<MetaCommand>();
  const rows: [string, string][] = [];
  for (const cmd of registry.values()) {
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const names = [cmd.name, ...(cmd.aliases ?? [])].join(", ");
    rows.push([names, cmd.description]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  const width = Math.max(...rows.map(([n]) => n.length));
  const lines = [
    "simulation commands (sent to the simulator):",
    "  /locate    pinpoint an identity in the latent space",
    "  /summon    conjure an entity from the multiverse of identity",
    "  /speak     communicate with an identity",
    "  /steer     alter the properties or traits of the simulated identity",
    "  /request   solicit artifacts, objects, code, art from the simulation",
    "  /[create]  invent your own command",
    "",
    "commands:",
    ...rows.map(([n, d]) => `  ${n.padEnd(width)}  ${d}`),
    "",
    "[Enter] on an empty line lets the searcher choose the next command.",
  ];
  return lines.join("\n");
}
