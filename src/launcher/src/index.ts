#!/usr/bin/env node

// Node, not `env -S bun --no-env-file --config=/dev/null`.
//
// The flags this shebang no longer carries were a deliberate security
// control, and it matters that they are gone because Node does not need them,
// not because anyone decided they were noise:
//
//   - `--no-env-file` existed because Bun autoloads ./.env, ./.env.local and
//     ./.env.<NODE_ENV> before the first line of this file runs. Node loads
//     no .env file unless it is asked to with --env-file, and nothing here
//     asks. So the hole the flag closed does not exist under Node.
//   - `--config=/dev/null` existed because Bun also autoloads ./bunfig.toml,
//     whose `preload` executes arbitrary code from whatever directory the
//     user happens to be standing in — `cd` into a cloned repo, run `yousim`,
//     and that repo chose what ran. No in-process guard can undo a preload.
//     Node has no bunfig.toml and no equivalent cwd-scoped config that can
//     run code, so again there is nothing to switch off.
//
// This is stated rather than left as a happy accident because the difference
// is the whole reason it is safe to drop two security flags: it is a property
// of the interpreter, and if the interpreter ever changes back, so must this.
// `hostile-dir.test.ts` launches the real installed command from a directory
// that has tried all of the above, so the claim is observed, not asserted.
//
// Deliberately NOT `#!/usr/bin/env -S node --disable-warning=...`: `env -S`
// has no Windows equivalent, npm's generated .cmd shim is what runs there,
// and whether it forwards interpreter arguments is not something this repo
// controls. Anything that has to happen before the first import happens in
// process, below.
//
// The Bun-invoked entry points keep their flags: src/cli/src/cli.ts and
// scripts/package.ts are still run by Bun in development, where every word of
// the paragraph above about ./.env and ./bunfig.toml still applies.

// This import is deliberately the only static one in this file, and this call
// is deliberately the first thing that runs.
//
// Node does not autoload ./.env, but `yousim-cli` and this launcher share a
// config resolver with surfaces that can be reached under Bun, and the rule
// this enforces — a cloned repo's .env is not a config source — is a property
// of the tool rather than of one interpreter. A repo that ships
// OPENAI_BASE_URL must not be able to point inference at a host of its
// choosing with the user's credential attached, whichever runtime read it.
// Everything else here loads through `await import` so that nothing can read
// process.env before it has been cleaned.
import { neutralizeCwdEnv } from "@yousim/core/config";

const droppedFromCwdEnv = neutralizeCwdEnv();

// Silence one warning, before anything that could trigger it is imported.
//
// `node:sqlite` is what backs storage under Node, and Node prints
// "ExperimentalWarning: SQLite is an experimental feature" to stderr on the
// first import in some versions (22.x does; 24.20 does not). It is noise on
// every single `yousim` invocation, it names an internal this tool's users did
// not choose, and it lands in the middle of terminal output that is the
// product here.
//
// It has to be installed BEFORE the storage import, which is why it lives at
// the top of the bin entry rather than next to the code that causes it — by
// the time `@yousim/core/storage` has been evaluated the warning has already
// been printed. Every subcommand below is reached through `await import`, so
// this genuinely runs first.
//
// Narrow on purpose: matched on both the warning class and the SQLite text, so
// an unrelated ExperimentalWarning — the next Node feature this package starts
// depending on, deprecations, anything the user needs to see — still prints.
// `process.on("warning")` cannot do this; it adds a listener without
// displacing the default one that writes to stderr.
//
// A no-op under Bun, where `process.emitWarning` does not route through
// `process.emit`. That is the right outcome rather than a gap: Bun has no
// `node:sqlite` to warn about, and the patch changes nothing else there.
const emitWarning = process.emit.bind(process);
// @ts-expect-error - patching an overloaded builtin; the runtime shape is fine
process.emit = (name: string, data: unknown, ...rest: unknown[]) => {
  if (
    name === "warning" &&
    data instanceof Error &&
    data.name === "ExperimentalWarning" &&
    /SQLite/i.test(data.message)
  ) {
    return false;
  }
  // @ts-expect-error - see above
  return emitWarning(name, data, ...rest);
};

const args = process.argv.slice(2);
const command = args[0];

const printHelp = () => {
  console.log(`YouSim - Identity Simulator

Usage:
  yousim              Start a simulator session
  yousim connect      Link an OpenRouter account (OAuth, no key to paste)
  yousim disconnect   Forget the stored key
  yousim sessions     List saved sessions
  yousim resume [id]  Resume a session (picker if no id given)
  yousim server       Start the API server + frontend
  yousim config       Show current configuration and where each value came from

Options:
  -p, --port <port>   Set server port (default: 3000)
      --headless      With "connect": print a URL and paste the code back,
                      for SSH sessions and containers
  -v, --version       Show version
  -h, --help          Show help

Config, highest precedence first:
  1. the flags above
  2. the shell environment
  3. ./.yousim.json      provider and model only — a repo cannot set a
                         credential or an endpoint
  4. ~/.yousim/config.json
  5. ~/.yousim/.env

  ./.env is NOT read. It is an ambient convention in unrelated repos, and
  honoring it would let a cloned repo redirect inference. Run "yousim config"
  to see what actually won.

Environment:
  PROVIDER            LLM provider: anthropic, openrouter, openai, groq
  MODEL               Model override. Choice matters a lot here: older, less
                      instruction-tuned models produce far more interesting
                      output than current frontier assistants.
  ANTHROPIC_API_KEY   Anthropic API key
  OPENAI_API_KEY      OpenAI API key
  OPENROUTER_API_KEY  OpenRouter API key (or just run \`yousim connect\`)
  GROQ_API_KEY        Groq API key
  OPENAI_BASE_URL     Any OpenAI-compatible endpoint (local vLLM, Ollama)
  HOST                Address the server binds (default: 127.0.0.1). There is
                      no auth, so 0.0.0.0 hands every session on this machine
                      to anyone who can reach the port.
  YOUSIM_DB           Database path override
  YOUSIM_HOME         Override the config and data directory outright
  YOUSIM_KEYCHAIN=0   Never use the macOS Keychain; store keys in a 0600 file

Data:
  Conversations are saved to ~/.yousim/yousim.db and survive restarts.
  Respects XDG_CONFIG_HOME and XDG_DATA_HOME when set.
`);
};

const mask = (key: string, value: string) =>
  key.includes("KEY") || key.includes("SECRET")
    ? "[set]"
    : value;

const printConfig = async (resolution: import("./config").Resolution) => {
  const {
    resolveDbPath,
    resolveProvider,
    resolveModel,
    credentialBackend,
    credentialsPath,
    connectedProvider,
  } = await import("@yousim/core");
  const { KEYS } = await import("./config");

  console.log("YouSim configuration\n");
  console.log(`  config dir   ${resolution.configDir}`);
  console.log(`  data dir     ${resolution.dataDir}`);
  console.log(`  database     ${resolveDbPath()}`);
  console.log(
    `  credentials  ${
      credentialBackend() === "keychain"
        ? `macOS Keychain (index: ${credentialsPath()})`
        : `${credentialsPath()} (0600)`
    }`
  );

  // Whatever the layers left unset falls through to a built-in default, and
  // the default is the interesting part — it is what actually runs. The
  // provider default is the connected account before it is "anthropic", the
  // same rule the CLI applies, so this output cannot disagree with the tool.
  // These rows are dropped below if a layer did set the key, so env is already
  // out of the picture and the connected account is the top of what is left.
  const connected = connectedProvider();
  const provider = connected ?? resolveProvider();
  const defaults: { key: string; value: string; origin: string }[] = [
    { key: "PROVIDER", value: provider, origin: connected ? "connected account" : "" },
    { key: "MODEL", value: resolveModel({ provider }), origin: "" },
  ];
  const rows = [
    ...resolution.settings.map((s) => ({
      key: s.key,
      value: mask(s.key, s.value),
      source: s.source,
      origin: s.origin ?? "",
    })),
    ...defaults
      .filter((d) => !resolution.settings.some((s) => s.key === d.key))
      .map((d) => ({ ...d, source: "default" as const })),
  ].sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key));

  console.log("\nSettings (flag > env > project > user > default):");
  const width = Math.max(...rows.map((r) => r.key.length + r.value.length + 1), 0);
  for (const row of rows) {
    const pair = `${row.key}=${row.value}`;
    console.log(`  ${pair.padEnd(width)}  ${row.source.padEnd(7)} ${row.origin}`.trimEnd());
  }

  // Reported here and nowhere else. ./.env is simply not a config source for
  // this tool, so there is nothing to announce on every launch — but someone
  // asking about configuration while staring at a .env that isn't working
  // deserves a straight answer.
  if (droppedFromCwdEnv.length > 0) {
    console.log(
      `\n${droppedFromCwdEnv.length} var(s) in ./.env ignored: ${droppedFromCwdEnv.join(", ")}` +
        `\n  ./.env is not a config source. Use .yousim.json for provider and model.`
    );
  }

  const { connectionStatus } = await import("@yousim/cli/connect");
  console.log("");
  connectionStatus();
};

if (command === "-v" || command === "--version" || command === "version") {
  // Read from the manifest rather than a second hardcoded constant, so this
  // can't drift from what was actually published.
  const { version } = await import("../package.json");
  console.log(version);
  process.exit(0);
}

if (command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

const main = async () => {
  // Parsed before resolution rather than at the server branch, so `yousim
  // config -p 8080` can honestly report PORT as coming from a flag.
  const flags: Record<string, string> = {};
  const portIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  if (portIndex !== -1 && args[portIndex + 1]) {
    flags.PORT = args[portIndex + 1]!;
  }

  const { resolveConfig } = await import("./config");
  const resolution = resolveConfig(flags);
  for (const warning of resolution.warnings) console.error(`yousim: ${warning}`);

  if (command === "config") {
    await printConfig(resolution);
    process.exit(0);
  }

  if (command === "connect") {
    const { connect } = await import("@yousim/cli/connect");
    await connect({ headless: args.includes("--headless") });
    return;
  }

  if (command === "disconnect") {
    const { disconnect } = await import("@yousim/cli/connect");
    await disconnect();
    return;
  }

  if (command === "sessions") {
    const { listSessions } = await import("@yousim/cli");
    await listSessions();
    return;
  }

  if (command === "resume") {
    const { resumeSession } = await import("@yousim/cli");
    await resumeSession(args[1]);
    return;
  }

  if (command === "server") {
    const { startServer } = await import("@yousim/api");
    // Awaited: startServer resolves once the socket is actually up and has
    // reported its address. Unawaited, a listen failure became an unhandled
    // rejection instead of the "Fatal error:" line main().catch() prints.
    await startServer();
    return;
  }

  // A bare word could plausibly be something the user meant to type at the
  // prompt, so it falls through to a session. An unrecognized *flag* is always
  // a mistake, and silently starting a session hides it — `yousim --version`
  // used to open the simulator.
  if (command?.startsWith("-")) {
    console.error(`Unknown option: ${command}\nRun \`yousim --help\` for usage.`);
    process.exit(2);
  }

  const { runCli } = await import("@yousim/cli");
  await runCli();
};

main().catch((error) => {
  console.error("Fatal error:", error?.message || error);
  process.exit(1);
});
