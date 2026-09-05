/**
 * Running the published command from a directory chosen by someone else.
 *
 * This is the claim that matters for a distributed CLI. `cd` into a cloned
 * repo and type `yousim`, and that repo has had a say in what happens: Bun
 * autoloads `./.env`, `./.env.local`, `./.env.<NODE_ENV>` and — worse —
 * `./bunfig.toml`, whose `preload` executes arbitrary code before the first
 * line of this package runs. Nothing in-process can undo a preload. Under Bun
 * the only control is the shebang refusing to load bunfig at all.
 *
 * The published bin now runs on Node, whose shebang carries no such flags,
 * and this file is *more* important for that, not less. The reason the flags
 * could go is that Node reads neither `./.env` (it needs an explicit
 * `--env-file`) nor any cwd-scoped config that can execute code — there is no
 * Node bunfig.toml. That is a property of the interpreter, asserted nowhere in
 * this repo's own source, and taking it on faith is how a package ships an
 * arbitrary-code-execution hole the day it changes. So these tests keep
 * running against the same hostile directory: the bunfig and every .env
 * variant are still on disk, still trying, and the assertions are unchanged.
 * What changed is only which mechanism makes them fail.
 *
 * The test this replaces asserted this by grepping the source for the shebang
 * flags. That checks the flags are written down; it does not check they work.
 * Between the two sits everything that can go wrong: a bundler that drops the
 * shebang, an npm shim that ignores it, a platform without `env -S`. So these
 * launch the real installed command from a real malicious directory and look
 * at what happened.
 */

import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installArtifact } from "../../../../scripts/package";
import { hermeticEnv } from "../../../../scripts/hermetic";

const install = installArtifact();

/** Requests the hostile "provider endpoint" received. Must stay zero. */
let hits: { url: string; auth: string | null }[] = [];
let sink: ReturnType<typeof Bun.serve>;
let sinkUrl = "";

/** Where a bunfig preload would leave its calling card. */
let markerDir = "";
const markerPath = () => join(markerDir, "preload-ran");

let hostile = "";

beforeAll(() => {
  // A real listener rather than an unroutable address, so "no request was
  // attempted" is something observed rather than inferred from a timeout.
  sink = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      hits.push({ url: req.url, auth: req.headers.get("authorization") });
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    },
  });
  sinkUrl = `http://127.0.0.1:${sink.port}/v1`;

  // Outside both the hostile cwd and the hermetic HOME, so an existing marker
  // proves the preload executed rather than that a write happened to be
  // permitted somewhere.
  markerDir = mkdtempSync(join(tmpdir(), "yousim-marker-"));
  hostile = buildHostileDir();
});

afterAll(() => {
  sink?.stop(true);
  rmSync(markerDir, { recursive: true, force: true });
  rmSync(hostile, { recursive: true, force: true });
});

/** A directory that has tried everything an untrusted repo can try. */
function buildHostileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "yousim-hostile-"));

  // Quoted values and ${VAR} expansion, because a parser that handles the
  // plain form and not these leaves a live redirect behind. Bun's .env loader
  // does expand ${...}; the point is that none of this should be read at all.
  writeFileSync(
    join(dir, ".env"),
    [
      `PROVIDER="openai"`,
      `OPENAI_BASE_URL="${sinkUrl}"`,
      `OPENAI_API_KEY='sk-hostile-openai-key'`,
      `ANTHROPIC_API_KEY=sk-ant-hostile`,
      `MODEL=hostile/model-from-dotenv`,
      // Expansion: if this lands, HOST is 0.0.0.0 and the server that has no
      // auth is on the network.
      `HOSTILE_BASE=${sinkUrl}`,
      `HOST=0.0.0.0`,
      `YOUSIM_HOME=\${HOME}/hijacked`,
      "",
    ].join("\n")
  );

  writeFileSync(
    join(dir, ".env.local"),
    [`OPENAI_BASE_URL="${sinkUrl}/local"`, `MODEL=hostile/model-from-env-local`, ""].join("\n")
  );

  writeFileSync(
    join(dir, ".env.production"),
    [`OPENAI_BASE_URL="${sinkUrl}/prod"`, `MODEL=hostile/model-from-env-production`, ""].join("\n")
  );

  // The one no in-process guard can reach. If this runs, the marker exists and
  // the attacker had arbitrary code execution as the user.
  writeFileSync(
    join(dir, "evil.ts"),
    `import { writeFileSync } from "node:fs";\n` +
      `writeFileSync(${JSON.stringify(markerPath())}, "preload executed\\n");\n`
  );
  writeFileSync(join(dir, "bunfig.toml"), `preload = ["./evil.ts"]\n[test]\npreload = ["./evil.ts"]\n`);

  // A repo may choose provider and model. It may not supply a credential or an
  // endpoint, and it must be told so rather than silently ignored.
  writeFileSync(
    join(dir, ".yousim.json"),
    JSON.stringify({ provider: "groq", apiKey: "sk-project-hostile", baseURL: sinkUrl })
  );

  return dir;
}

interface Run {
  code: number | null;
  out: string;
  err: string;
  /** Files created in the hermetic HOME during the run. */
  homeEntries: string[];
}

/** Launch the installed command from the hostile directory. */
function launch(args: string[], extraEnv: Record<string, string> = {}): Run {
  hits = [];
  rmSync(markerPath(), { force: true });
  const { env, home, cleanup } = hermeticEnv(extraEnv);
  try {
    const p = Bun.spawnSync([install.bin, ...args], {
      cwd: hostile,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      code: p.exitCode,
      out: p.stdout.toString(),
      err: p.stderr.toString(),
      homeEntries: existsSync(home) ? readdirSync(home) : [],
    };
  } finally {
    cleanup();
  }
}

describe("a hostile working directory", () => {
  test("bunfig preload does not execute", () => {
    // Under a Bun shebang this was the whole reason for `--config=/dev/null`.
    // Under a Node shebang it holds because Node has no bunfig.toml to load —
    // but the file is still here and still trying, so this stays the test that
    // notices if the bin ever goes back to being launched by Bun without the
    // flag. If the marker exists, running `yousim` in a cloned repo is
    // arbitrary code execution.
    launch(["--help"]);
    expect(existsSync(markerPath())).toBe(false);

    launch(["config"]);
    expect(existsSync(markerPath())).toBe(false);
  });

  test("no .env variant reaches the resolved config", () => {
    const r = launch(["config"]);
    expect(r.code).toBe(0);

    // The endpoint is the credential-disclosure vector: it decides who
    // receives the user's key.
    expect(r.out).not.toContain(sinkUrl);
    expect(r.out).not.toContain("OPENAI_BASE_URL");

    // Provider and model would redirect inference; keys would supply the
    // attacker's account (or bill the user's).
    expect(r.out).not.toContain("hostile/model-from-dotenv");
    expect(r.out).not.toContain("hostile/model-from-env-local");
    expect(r.out).not.toContain("sk-hostile-openai-key");
    // Keys print as "[set]", so the leak shows up as the key being listed.
    expect(r.out).not.toContain("ANTHROPIC_API_KEY");
    expect(r.out).not.toContain("OPENAI_API_KEY");

    // HOST=0.0.0.0 from a repo would put an unauthenticated server holding
    // every session on this machine onto the network.
    expect(r.out).not.toContain("0.0.0.0");
  });

  test("NODE_ENV makes .env.production live, and it is still not read", () => {
    // Bun autoloads `.env.<NODE_ENV>` too, and NODE_ENV is a variable anything
    // in the environment might set. A guard covering `.env` and `.env.local`
    // and stopping there leaves this one live, which is the exact shape of the
    // bug that already shipped once with `.env.local`. Node autoloads none of
    // the three, and neutralizeCwdEnv covers `./.env` on top of that for
    // whichever runtime got there first.
    const r = launch(["config"], { NODE_ENV: "production" });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("hostile/model-from-env-production");
    expect(r.out).not.toContain(sinkUrl);
  });

  test("no request is made to the endpoint the directory supplied", () => {
    launch(["config"]);
    // Observed, not assumed: the sink is a live local listener that counts.
    expect(hits).toEqual([]);
  });

  test("a project file cannot set a credential or an endpoint, and says so", () => {
    // The counterpart to the .env rules: `.yousim.json` IS read, so the
    // refusal has to happen in the allowlist rather than by not looking.
    const r = launch(["config"]);
    expect(r.err).toContain("ignoring");
    expect(r.err).toContain("apiKey");
    expect(r.err).toContain("baseURL");
    expect(r.out).not.toContain("sk-project-hostile");
    // provider IS allowed from a project file, so this proves the file was
    // read and selectively refused rather than skipped wholesale.
    expect(r.out).toContain("groq");
  });

  test("nothing is written into the hostile directory", () => {
    const before = readdirSync(hostile).sort();
    launch(["config"]);
    launch(["--help"]);
    expect(readdirSync(hostile).sort()).toEqual(before);
  });

  test("writes stay inside the hermetic home", () => {
    // `yousim config` should not need to write at all. Anything appearing here
    // is a side effect of a diagnostic command, which is how a "read-only"
    // command ends up moving a credential.
    //
    // The runtime's own cache is a different thing from ours and is allowed.
    // `Library/Caches/bun` appeared here the day the published `bin` became a
    // shim that execs Bun explicitly: the old shebang named `node`, so on a
    // machine with both, Node ran the bundle and never cached anything. This
    // is Bun's transpiler cache, created before our first line executes, and
    // there is nothing this package can do about it short of not being run by
    // Bun. The Linux spellings are listed for the same reason.
    //
    // Keep the list exact rather than pattern-matching. The point is to notice
    // a *new* entry and have to justify it, which is what happened here.
    const RUNTIME_CACHES = ["Library", ".cache", ".bun"];
    const r = launch(["config"]);
    for (const entry of r.homeEntries) {
      expect(["yousim", "xdg-config", "xdg-data", ...RUNTIME_CACHES]).toContain(entry);
    }
  });
});
