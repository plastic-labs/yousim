/**
 * What actually gets published.
 *
 * The unit tests prove the code works in this repo. Nothing in them says
 * anything about the tarball, and the tarball is the only thing a stranger
 * ever sees: a bundle, unpacked into a directory that has no workspace links,
 * no dev files, and none of this repo's environment. Every packaging bug this
 * project has had was invisible to `bun test src/core`.
 *
 * So these assert against `npm pack` output and against a real install of it.
 */

import { expect, test, describe, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildArtifact, installArtifact } from "../../../../scripts/package";
import { hermeticEnv } from "../../../../scripts/hermetic";

const artifact = buildArtifact();

/** Extract once to a scratch dir so contents can be read, not just names. */
let extracted: string | undefined;
function extract(): string {
  if (extracted) return extracted;
  const dir = mkdtempSync(join(tmpdir(), "yousim-tar-"));
  const p = Bun.spawnSync(["tar", "-xf", artifact.tarball, "-C", dir], { stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`extract failed: ${p.stderr.toString()}`);
  return (extracted = join(dir, "package"));
}

afterAll(() => {
  if (extracted) rmSync(join(extracted, ".."), { recursive: true, force: true });
});

describe("tarball shape", () => {
  test("no path escapes the package directory", () => {
    // A traversal or absolute entry is how an install writes outside its own
    // prefix. Asserted from the listing rather than after extraction, because
    // extracting first is the thing that would already have done the damage.
    for (const entry of artifact.entries) {
      expect(entry).not.toStartWith("/");
      expect(entry).not.toMatch(/(^|\/)\.\.($|\/)/);
      expect(entry).not.toMatch(/^[A-Za-z]:/); // a Windows absolute path
    }
  });

  test("no symlinks", () => {
    // Two reasons, and the second is why this test exists at all. A symlink in
    // a tarball can point anywhere on the installing machine. And npm silently
    // drops symlinks when packing, so one used as a build shortcut becomes a
    // file that is simply absent from the published package — which is exactly
    // how the web assets went missing.
    const links = artifact.listing.split(/\r?\n/).filter((l) => l.startsWith("l") || l.includes(" -> "));
    expect(links).toEqual([]);
  });

  test("no lifecycle scripts run on install", () => {
    // `npm install yousim` must not execute anything. There is nothing this
    // package needs to do at install time, so any script here is either a
    // mistake or an attack.
    const manifest = JSON.parse(readFileSync(join(extract(), "package.json"), "utf8"));
    const scripts = manifest.scripts ?? {};
    const lifecycle = [
      "preinstall",
      "install",
      "postinstall",
      "prepare",
      "prepublish",
      "prepublishOnly",
      "prepack",
      "postpack",
    ];
    expect(lifecycle.filter((s) => s in scripts)).toEqual([]);
  });

  test("nothing a consumer installs is on the workspace protocol", () => {
    // `workspace:*` is meaningless outside this repo, and npm does not rewrite
    // it on pack: publishing one in `dependencies` produces a package that
    // cannot install at all. The bundle is what makes zero of them possible.
    //
    // devDependencies are excluded on purpose, not overlooked. npm never
    // installs a dependency's devDependencies, and the launcher has to declare
    // the workspace members there for bun to link them for the bundle step —
    // remove the declaration and node_modules/@yousim is empty and the build
    // cannot resolve anything. So the claim is about what a consumer installs.
    const manifest = JSON.parse(readFileSync(join(extract(), "package.json"), "utf8"));
    const installed = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    };
    expect(Object.entries(installed).filter(([, v]) => String(v).includes("workspace:"))).toEqual([]);

    // And there should be none at all: everything is inlined. The install in
    // the suite below runs with `--offline`, which is the end-to-end proof —
    // a single fetchable dependency would make it fail outright.
    expect(installed).toEqual({});
  });

  test("no dev or ignored file is shipped", () => {
    // `files` is an allowlist, so this is a regression guard on it rather than
    // on .npmignore: the day someone widens it to ["."], this fails.
    const forbidden = [
      /(^|\/)\.env($|\.)/,
      /(^|\/)node_modules(\/|$)/,
      /\.test\.ts$/,
      /(^|\/)__tests__(\/|$)/,
      /(^|\/)\.git(\/|$|ignore|attributes)/,
      /(^|\/)bun\.lock(b)?$/,
      /(^|\/)tsconfig\.json$/,
      /(^|\/)\.claude(\/|$)/,
      /(^|\/)supabase(\/|$)/,
      /signing_key\.json$/,
      /(^|\/)legacy-python(\/|$)/,
      /(^|\/)\.vscode(\/|$)/,
      /(^|\/)Dockerfile$/,
      /(^|\/)docker-compose\.yml$/,
      /\.map$/, // a source map republishes the whole source tree
    ];
    const shipped = artifact.entries.filter((e) => forbidden.some((f) => f.test(e)));
    expect(shipped).toEqual([]);
  });

  test("no credential is baked into the artifact", () => {
    const root = extract();
    // Provider key shapes, plus the generic PEM header. Matching on shape
    // rather than on any particular value is the point: a key that leaked
    // from the build machine is by definition one this test has never seen.
    const patterns: [string, RegExp][] = [
      ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
      ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9]{32,}/],
      ["OpenRouter key", /sk-or-v1-[A-Za-z0-9]{32,}/],
      ["Groq key", /gsk_[A-Za-z0-9]{40,}/],
      ["AWS access key", /AKIA[0-9A-Z]{16}/],
      ["private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
      ["Supabase JWT", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
    ];

    const found: string[] = [];
    for (const entry of artifact.entries) {
      const file = join(root, entry);
      if (!existsSync(file) || statSync(file).isDirectory()) continue;
      const text = readFileSync(file, "utf8");
      for (const [name, re] of patterns) {
        if (re.test(text)) found.push(`${entry}: ${name}`);
      }
    }
    expect(found).toEqual([]);
  });

  test("`yousim` is the only publishable package in the workspace", () => {
    // The decision: one unscoped package ships, and it inlines the rest. If a
    // workspace package loses `private`, `npm publish -w` will happily upload
    // it — a second, source-shaped `@yousim/core` on the registry that nobody
    // meant to support.
    //
    // Asserted from the manifests rather than from `npm publish --dry-run`,
    // which exits 0 for a private package and only *warns* ("Skipping
    // workspace ..., marked as private"). A CI step keyed on that exit code
    // reads as a passing gate while checking nothing.
    const root = join(import.meta.dir, "..", "..", "..", "..");
    const publishable: string[] = [];
    for (const pkg of ["api", "cli", "core", "web", "launcher"]) {
      const manifest = JSON.parse(readFileSync(join(root, "src", pkg, "package.json"), "utf8"));
      if (manifest.private !== true) publishable.push(`${pkg} (${manifest.name})`);
    }
    expect(publishable).toEqual(["launcher (yousim)"]);
  });

  test("the web assets, README and LICENSE are present", () => {
    // None of these three can be reached by a link or by npm's own defaults.
    // npm silently drops symlinks when packing, so the `src/api/public ->
    // ../web/dist` shortcut published a package whose UI was simply absent and
    // whose `server` command had nothing to serve; and npm picks README and
    // LICENSE up from the package directory only, while both live at the repo
    // root. `scripts/package.ts` copies all three in before packing, and this
    // is the gate on that copy still happening.
    expect(artifact.entries).toContain("public/index.html");
    expect(artifact.entries.some((e) => e.startsWith("public/assets/"))).toBe(true);
    expect(artifact.entries).toContain("README.md");
    expect(artifact.entries).toContain("LICENSE");
  });
});

describe("a real install", () => {
  const install = installArtifact();

  /** Run the installed command the way a user would, in a clean environment. */
  function runInstalled(args: string[], cwd: string) {
    const { env, cleanup } = hermeticEnv();
    try {
      const p = Bun.spawnSync([install.bin, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
      return {
        code: p.exitCode,
        out: p.stdout.toString(),
        err: p.stderr.toString(),
      };
    } finally {
      cleanup();
    }
  }

  test("--help runs from the installed bin", () => {
    const r = runInstalled(["--help"], install.dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain("YouSim");
    expect(r.out).toContain("yousim server");
  });

  test("config runs and reports the hermetic directories, not the real ones", () => {
    const r = runInstalled(["config"], install.dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain("YouSim configuration");
    // If this ever names the developer's real home, the isolation is broken
    // and every other test in this file is testing the wrong machine.
    expect(r.out).not.toContain(join(process.env.HOME ?? "/nonexistent", ".yousim"));
  });

  // Windows has no mode bits; the .cmd shim is what makes the command run
  // there, and `--help` above already proves it does.
  test.skipIf(process.platform === "win32")("the installed bin is executable", () => {
    // npm preserves the executable bit from the tarball; a 644 entry produces
    // a command that exists on PATH and refuses to run.
    expect(statSync(install.bin).mode & 0o111).toBeGreaterThan(0);
  });
});
