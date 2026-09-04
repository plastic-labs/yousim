/**
 * Build the thing that actually gets published, and hand tests its path.
 *
 * Every bug found in this repo lately was on a failure path or a packaging
 * path. Neither is reachable from `bun test src/core`, because that tests the
 * source tree — a layout that exists on no user's machine. The published
 * artifact is a bundle, in a tarball, unpacked somewhere else, with no
 * workspace links and no dev files. So the tests assert against the tarball.
 *
 * Run as a script it always rebuilds. Imported by a test it builds only if
 * the artifact is missing, so a `bun test` run does the work once.
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./hermetic";

const LAUNCHER = join(REPO_ROOT, "src", "launcher");
const WEB = join(REPO_ROOT, "src", "web");
const OUT = join(REPO_ROOT, ".pack");

/**
 * Files that only exist inside the launcher package because this script put
 * them there. Removed before each build so a rename or a deleted asset cannot
 * survive into the next tarball, and listed in .gitignore for the same reason
 * `dist/` is: they are build output, not source.
 */
const COPIED = ["public", "README.md", "LICENSE"];

export interface Artifact {
  /** The .tgz npm would upload. */
  tarball: string;
  /** Entry paths inside it, "package/" prefix stripped. */
  entries: string[];
  /** Raw `tar -tv` lines, for assertions about modes and link targets. */
  listing: string;
}

function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    throw new Error(
      `${cmd.join(" ")} failed in ${cwd} (exit ${p.exitCode})\n` +
        `${p.stdout.toString()}\n${p.stderr.toString()}`
    );
  }
  return p.stdout.toString();
}

/**
 * Bundle, then pack.
 *
 * `--target bun` is what makes one unscoped package possible: the four
 * workspace packages collapse into a single file, so the published manifest
 * declares no dependencies and there is no `workspace:*` left to go
 * unresolved on someone else's machine.
 */
export function buildArtifact(force = false): Artifact {
  const existing = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".tgz")) : [];
  if (!force && existing.length === 1) {
    return inspect(join(OUT, existing[0]!));
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  rmSync(join(LAUNCHER, "dist"), { recursive: true, force: true });
  for (const name of COPIED) rmSync(join(LAUNCHER, name), { recursive: true, force: true });

  // The web assets have to exist before the launcher is packed, because the
  // server serves them from inside the package.
  run([process.execPath, "run", "build"], WEB);

  // Real files, not a symlink into src/web/dist. npm silently drops symlinks
  // when packing, so a link here publishes a package whose `public/` is simply
  // absent and whose `server` command has nothing to serve.
  cpSync(join(WEB, "dist"), join(LAUNCHER, "public"), { recursive: true });

  // npm picks README and LICENSE up from the package directory only, and both
  // live at the repo root: without the copy the npm page renders no readme and
  // the tarball ships no licence.
  copyFileSync(join(REPO_ROOT, "README.md"), join(LAUNCHER, "README.md"));
  copyFileSync(join(REPO_ROOT, "LICENSE"), join(LAUNCHER, "LICENSE"));

  run(
    [
      process.execPath,
      "build",
      "--target",
      "bun",
      join(LAUNCHER, "src", "index.ts"),
      "--outfile",
      join(LAUNCHER, "dist", "yousim.js"),
    ],
    REPO_ROOT
  );

  // npm rather than bun: npm is what publishes, and its file-selection rules
  // (including the ones about symlinks) are the rules that will apply.
  //
  // A run-local --cache because packing must not depend on, or write to, the
  // machine's npm cache. That is the same hermetic rule the tests follow, and
  // it is also what makes this work on a locked-down CI runner.
  run(["npm", "pack", "--pack-destination", OUT, "--cache", join(OUT, "npm-cache")], LAUNCHER);

  const packed = readdirSync(OUT).filter((f) => f.endsWith(".tgz"));
  if (packed.length !== 1) throw new Error(`expected one tarball in ${OUT}, got ${packed.length}`);
  return inspect(join(OUT, packed[0]!));
}

function inspect(tarball: string): Artifact {
  const listing = run(["tar", "-tvf", tarball], OUT);
  const entries = listing
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.trim().split(/\s+/).slice(-1)[0]!)
    // tar prints "a -> b" for a symlink; the name is the left side.
    .map((n) => n.replace(/^package\//, ""))
    .filter((n) => n && n !== "package");
  return { tarball, entries, listing };
}

export interface Install {
  /** An otherwise empty directory with the package installed into it. */
  dir: string;
  /** The command a user would actually get on their PATH. */
  bin: string;
}

/**
 * Install the tarball the way a stranger would.
 *
 * `--offline` is the assertion, not a speed trick: it makes the install fail
 * outright if the manifest declares a single dependency npm would have to go
 * and fetch. That is how "no unresolved workspace:*" gets proved end to end
 * rather than by reading the manifest and hoping.
 *
 * Scripts are deliberately NOT ignored. A published package that runs code on
 * install is the thing being tested for; skipping the phase would hide it.
 */
export function installArtifact(force = false): Install {
  const dir = join(OUT, "install");
  const bin = join(dir, "node_modules", ".bin", process.platform === "win32" ? "yousim.cmd" : "yousim");
  if (!force && existsSync(bin)) return { dir, bin };

  const { tarball } = buildArtifact();
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "host", private: true }) + "\n");

  run(
    [
      "npm",
      "install",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--cache",
      join(OUT, "npm-cache"),
      tarball,
    ],
    dir
  );
  return { dir, bin };
}

if (import.meta.main) {
  const artifact = buildArtifact(true);
  console.log(`packed ${artifact.tarball}`);
  console.log(artifact.entries.map((e) => `  ${e}`).join("\n"));
}
