/**
 * The API's trust boundary.
 *
 * This server has no auth, deliberately: it is a local single-user tool and
 * every request is the owner. That design only holds if two things are true —
 * the socket is not reachable from the network, and a page the user happens to
 * have open in a browser cannot drive it. Those are the two properties tested
 * here, along with what a malformed request does and whether an error hands
 * the caller a filesystem path.
 *
 * Requests go through `app.handle()` rather than a socket wherever a socket
 * adds nothing: it is the same Elysia pipeline, without a port to collide on.
 * The bind address is the exception, because "does not listen on 0.0.0.0" is a
 * claim about a real socket and nothing else can prove it.
 */

import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir, networkInterfaces } from "node:os";
import { createApp } from "../index";
import { MemoryStorage } from "@yousim/core/storage";
import type { Storage } from "@yousim/core/storage";
import { REPO_ROOT } from "../../../../scripts/hermetic";

let dbHome: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  // The storage singleton reads YOUSIM_DB the first time a route touches it,
  // so this has to be set before the first request, not before the import.
  dbHome = mkdtempSync(join(tmpdir(), "yousim-api-"));
  process.env.YOUSIM_HOME = dbHome;
  process.env.YOUSIM_DB = join(dbHome, "boundary.db");
  app = createApp();
});

afterAll(() => rmSync(dbHome, { recursive: true, force: true }));

const url = (path: string) => `http://localhost:3000${path}`;

function get(path: string, headers: Record<string, string> = {}) {
  return app.handle(new Request(url(path), { headers }));
}

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.handle(
    new Request(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

/**
 * Create a session, priming the `users` row first.
 *
 * The priming call should not be necessary — see "a fresh database serves the
 * first request" below, which is the test that pins that bug. It is done here
 * so the rest of this file tests the boundary it means to test rather than
 * failing on an unrelated 500.
 */
async function newSession(): Promise<string> {
  await get("/user?name=boundary-test");
  const res = await post("/reset");
  const json = (await res.json()) as { session_id: string };
  expect(res.status).toBe(200);
  return json.session_id;
}

/**
 * Start the real server in a child process and return the address it bound.
 *
 * A subprocess rather than `app.handle()` for the two claims that need one: a
 * bind address is a property of a socket, and the storage handle is a
 * module-level singleton, so a fresh database needs a fresh process.
 *
 * Started from source rather than from the packaged bin because the package
 * does not ship the web assets yet and `yousim server` refuses to start
 * without them, which would fail these for an unrelated reason.
 */
async function withServer<T>(
  extraEnv: Record<string, string | undefined>,
  fn: (base: string, host: string) => Promise<T>
): Promise<T> {
  // Built by deletion rather than by assigning undefined, so HOST is genuinely
  // absent and the server falls through to its own default.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.HOST;
  // PORT=0 asks for an ephemeral port, so this cannot collide with anything
  // and the startup line reports the address actually bound.
  env.PORT = "0";
  for (const [k, v] of Object.entries(extraEnv)) {
    v === undefined ? delete env[k] : (env[k] = v);
  }

  const proc = Bun.spawn([process.execPath, join(REPO_ROOT, "src", "api", "src", "index.ts")], {
    cwd: REPO_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const match = await Promise.race([
      (async () => {
        const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let seen = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          seen += decoder.decode(value, { stream: true });
          const m = /running at http:\/\/([^:]+):(\d+)/.exec(seen);
          if (m) {
            reader.releaseLock();
            return m;
          }
        }
        throw new Error(`server never reported an address. stdout:\n${seen}`);
      })(),
      Bun.sleep(20_000).then(() => {
        throw new Error("timed out waiting for the server to report its address");
      }),
    ]);
    const [, host, port] = match;
    return await fn(`http://127.0.0.1:${port}`, host!);
  } finally {
    proc.kill();
    await proc.exited;
  }
}

describe("bind address", () => {
  test("the server binds loopback, not 0.0.0.0", async () => {
    await withServer({}, async (base, host) => {
      // Bun's default is a wildcard bind. On a server with no auth that hands
      // every session on this machine to anyone who can reach the port.
      expect(host).not.toBe("0.0.0.0");
      expect(host).not.toBe("::");
      expect(["127.0.0.1", "localhost", "::1"]).toContain(host);

      // The socket is real, so use it.
      expect((await fetch(`${base}/api/health`)).status).toBe(200);

      // And it is genuinely not on any other local address. Left unasserted
      // rather than faked when the machine has no non-loopback interface.
      const external = Object.values(networkInterfaces())
        .flat()
        .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
      if (external) {
        const port = new URL(base).port;
        const reachable = await fetch(`http://${external}:${port}/api/health`, {
          signal: AbortSignal.timeout(2_000),
        }).then(
          () => true,
          () => false
        );
        expect(reachable).toBe(false);
      }
    });
  }, 30_000);

  test("HOST is honoured, so a container can still publish a port", async () => {
    // The loopback default must be a default, not a hard-coding: the
    // Dockerfile needs 0.0.0.0 because a published port cannot reach loopback
    // inside a container. If this breaks, the container image stops working.
    await withServer({ HOST: "0.0.0.0" }, async (_base, host) => {
      expect(host).toBe("0.0.0.0");
    });
  }, 30_000);
});

describe("a fresh install", () => {
  test("a fresh database serves the first request", async () => {
    // Regression guard: this failed until the fix landed. The explanation
    // below is why the test exists, not a description of current behaviour.
    //
    // `sessions.user_id` is a FOREIGN KEY into `users`, and `PRAGMA
    // foreign_keys = ON`. The only code that inserts a `users` row is
    // `GET /user?name=...`. `POST /reset` and `POST /v1/construct` both go
    // straight to `createSession`, so on a database that has never seen a
    // /user call they fail with a 500: "FOREIGN KEY constraint failed".
    //
    // The CLI gets this right (cli.ts upserts the owner before creating a
    // session). The server does not. It does not show up in development
    // because a developer's ~/.yousim/yousim.db already has the `local` row
    // from some earlier CLI run — it only happens on a stranger's machine,
    // which is the whole point of this suite.
    //
    // /v1/construct is the worse half: it is the documented programmatic
    // entry point, and a caller has no reason to call /user at all.
    // A child process, because the storage handle is a module-level singleton
    // and this needs a database no request has ever touched.
    const fresh = mkdtempSync(join(tmpdir(), "yousim-fresh-"));
    try {
      await withServer({ YOUSIM_DB: join(fresh, "fresh.db") }, async (base) => {
        const reset = await fetch(`${base}/reset`, { method: "POST" });
        expect(await reset.text()).not.toContain("FOREIGN KEY");
        expect(reset.status).toBe(200);

        const construct = await fetch(`${base}/v1/construct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hello" }),
        });
        // A missing model credential is a legitimate 500 here; a foreign-key
        // failure is not. Distinguish them rather than accepting either.
        expect(await construct.text()).not.toContain("FOREIGN KEY");
      });
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("cross-origin", () => {
  test("a non-localhost Origin gets no CORS allowance", async () => {
    // `cors()` with no options reflects any Origin back and pairs it with
    // Allow-Credentials, which would let any open page read the user's
    // sessions and spend their model credit.
    const res = await get("/api/health", { Origin: "https://evil.example" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a localhost Origin is allowed, so `bun run dev` still works", async () => {
    // The negative above is only meaningful if the positive holds; otherwise
    // it would pass with CORS switched off entirely.
    const res = await get("/api/health", { Origin: "http://localhost:5173" });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  test("a lookalike origin is not allowed", async () => {
    // The allowance is a regex. These are the strings that defeat a sloppy one.
    for (const origin of [
      "http://localhost.evil.example",
      "http://127.0.0.1.evil.example",
      "http://evil.example/?localhost",
      "http://notlocalhost",
    ]) {
      const res = await get("/api/health", { Origin: origin });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  test("a preflight from a non-localhost Origin is not granted", async () => {
    const res = await app.handle(
      new Request(url("/manual"), {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a cross-origin state change is refused, not merely unreadable", async () => {
    // Regression guard: this failed until the fix landed. The explanation
    // below is why the test exists, not a description of current behaviour.
    //
    // `POST /reset` takes no body, so a cross-origin `fetch(url, {method:
    // "POST"})` is a CORS *simple* request: no preflight, and the browser
    // sends it. CORS then withholds the response from the calling page — but
    // the handler has already run, and /reset deletes a session.
    //
    // So an attacker page cannot read anything, and does not need to: it can
    // destroy the user's conversation from any tab they have open. CORS is a
    // read control. Refusing a state-changing request from a foreign Origin is
    // a separate check, and there isn't one.
    const session = await newSession();

    const res = await post(`/reset?session_id=${session}`, undefined, {
      Origin: "https://evil.example",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // And the session it aimed at must still be there.
    const after = await get(`/session?session_id=${session}`);
    const body = (await after.json()) as { messages?: unknown[]; error?: string };
    expect(body.error).toBeUndefined();
  });
});

describe("malformed and oversized bodies", () => {
  test("invalid JSON is rejected without a 500", async () => {
    const res = await post("/manual", "{ not json at all");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("a body missing a required field is rejected", async () => {
    const res = await post("/manual", { session_id: "x" }); // no `command`
    expect(res.status).toBe(422);
  });

  test("a wrong-typed field is rejected rather than coerced", async () => {
    const res = await post("/manual", { session_id: 1, command: ["ls"] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("an oversized body does not take the server down", async () => {
    // There is no maxRequestBodySize here, so Bun's 128MB default applies and
    // this is accepted. Reported as a finding; what is asserted is the
    // property that actually matters — the process survives and keeps
    // answering, and an 8MB command is not quietly forwarded to a model.
    const res = await post("/manual", { session_id: "nope", command: "x".repeat(8 * 1024 * 1024) });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Still alive and still serving.
    expect((await get("/api/health")).status).toBe(200);
  });

  test("a deeply nested body does not crash the parser", async () => {
    let nested: any = "leaf";
    for (let i = 0; i < 2_000; i++) nested = { n: nested };
    const res = await post("/manual", { session_id: "x", command: "y", extra: nested });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect((await get("/api/health")).status).toBe(200);
  });
});

describe("error responses", () => {
  /** Every route returns `{ error: error.message }`, so scan for paths. */
  function leaksAPath(text: string): string | undefined {
    const candidates = [
      homedir(),
      REPO_ROOT,
      dbHome,
      tmpdir(),
      "/Users/",
      "/home/",
      "C:\\Users\\",
      ".yousim",
      "node_modules",
    ];
    return candidates.find((c) => text.includes(c));
  }

  test("a 404 on an unknown session leaks no path", async () => {
    const res = await get("/session?session_id=does-not-exist");
    const text = await res.text();
    expect(leaksAPath(text)).toBeUndefined();
  });

  test("a missing required query parameter leaks no path", async () => {
    const res = await get("/user");
    const text = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(leaksAPath(text)).toBeUndefined();
  });

  test("a model call with no credential leaks no path and no key", async () => {
    // The most likely failure a real user hits: no provider key configured.
    //
    // /manual streams, so the response headers are already sent when the model
    // call fails and the handler calls controller.error(). Reading the body
    // therefore rejects rather than returning JSON — noted as a finding, not
    // asserted here. What is asserted is that nothing observable on the way
    // out names a path on this machine or looks like a credential.
    const session = await newSession();
    const res = await post("/manual", { session_id: session, command: "ls" });
    const text = await res.text().catch((e: Error) => e.message);

    expect(leaksAPath(text)).toBeUndefined();
    expect(text).not.toContain("sk-");
  });

  test("no stack trace reaches the client", async () => {
    const res = await post("/manual", { session_id: "missing-session", command: "ls" });
    const text = await res.text();
    expect(text).not.toContain("at async");
    expect(text).not.toContain(".ts:");
  });
});

describe("identity and state", () => {
  test("no request input can choose the storage user", async () => {
    // Every request is the hardcoded local owner. The regression this guards
    // is someone wiring a user id through from the request later: on a server
    // with no auth, a caller-supplied user id is a caller-supplied namespace.
    const session = await newSession();
    await post(`/reset?session_id=${session}`);

    const plain = await (await get("/sessions")).text();
    for (const forged of [
      "/sessions?user_id=someone-else",
      "/sessions?userId=someone-else",
      "/sessions?user=someone-else",
    ]) {
      expect(await (await get(forged)).text()).toBe(plain);
    }
    for (const header of ["X-User-Id", "X-User", "Authorization"]) {
      const res = await get("/sessions", { [header]: "someone-else" });
      expect(await res.text()).toBe(plain);
    }
  });

  test("the server states it is unauthenticated rather than implying auth", async () => {
    // The frontend branches on this. If it ever says anything but "local",
    // something has grown an auth layer that this package deliberately has not.
    const res = await get("/api/mode");
    expect(await res.json()).toEqual({ auth: "local" });
  });

  test("sessions are scoped by user in the store the API uses", async () => {
    // The API passes one user id, so the isolation seam can only be exercised
    // at the storage layer. If this stops holding, adding any second user
    // upstream silently shares everything.
    const { SqliteStorage } = await import("@yousim/core/storage");
    const store = new SqliteStorage();
    // sessions.user_id is a real foreign key, so the owner row has to exist
    // first. The API not doing this is the bug pinned in "a fresh install".
    await store.upsertUser("user-a", "a");
    await store.upsertUser("user-b", "b");
    const mine = await store.createSession("user-a", { mode: "sim" });
    await store.insertMessage(mine.id, "user-a", "private", true);

    expect(await store.getMessages(mine.id, "user-b")).toHaveLength(0);
    expect(await store.getSessions("user-b")).toHaveLength(0);
    expect(await store.getSessions("user-a")).not.toHaveLength(0);
  });

  test("the API wrote to the isolated database and nowhere else", async () => {
    // The whole suite ran against YOUSIM_DB in a temp dir. If the store were
    // resolving its own location instead of asking the config resolver, these
    // sessions would be in the developer's real database.
    const { resolveDbPath } = await import("@yousim/core/storage");
    await newSession();

    expect(resolveDbPath()).toBe(join(dbHome, "boundary.db"));
    expect(existsSync(join(dbHome, "boundary.db"))).toBe(true);
    expect(resolveDbPath().startsWith(homedir() + "/.yousim")).toBe(false);
  });
});

/**
 * The composition seam.
 *
 * `createApp()` with no arguments is the local single-user server, and the
 * whole suite above is the evidence that it still is — nothing in it was
 * changed for this. These tests are about the other caller: a downstream
 * consumer serving the same routes for many people, supplying its own store
 * and its own notion of who is calling.
 *
 * `MemoryStorage` rather than a hand-written stub, on purpose. Its `userId`
 * boundary is already pinned by the conformance test in
 * `core/__tests__/storage.test.ts`, which runs the same assertions against
 * both shipped implementations. A stub here would only prove that the stub
 * isolates its own map. Injecting a conformed store leaves exactly the new
 * thing to test: whether the route layer routes the *resolved* user into it.
 */
describe("injected storage and user resolution", () => {
  const USER_HEADER = "x-consumer-user";

  /** A consumer's app: one shared store, caller identified by a header. */
  const consumerApp = (store: Storage) =>
    createApp({
      storage: () => store,
      resolveUser: async (headers) => headers[USER_HEADER] ?? null,
    });

  const as = (
    consumer: ReturnType<typeof createApp>,
    user: string | null,
    path: string,
    method = "GET"
  ) =>
    consumer.handle(
      new Request(url(path), {
        method,
        headers: user === null ? {} : { [USER_HEADER]: user },
      })
    );

  test("a consumer's storage and resolver are what the routes use", async () => {
    const store = new MemoryStorage();
    const consumer = consumerApp(store);

    const user = await as(consumer, "alice", "/user?name=alice");
    expect(user.status).toBe(200);
    expect(await user.json()).toEqual({ user_id: "alice" });

    const reset = await as(consumer, "alice", "/reset", "POST");
    expect(reset.status).toBe(200);
    const { session_id, user_id } = (await reset.json()) as Record<string, string>;
    expect(user_id).toBe("alice");

    // The route wrote into the injected store, not the module's SQLite one.
    expect((await store.getSessions("alice")).map((s) => s.id)).toEqual([session_id!]);

    const listed = await as(consumer, "alice", "/sessions");
    expect(((await listed.json()) as { id: string }[]).map((s) => s.id)).toEqual([session_id!]);
  });

  test("an unauthenticated request is 401, never the local user", async () => {
    // The failure this guards is a silent fallback to the local owner when the
    // resolver declines. On a multi-caller deployment that is not a missing
    // check, it is every unauthenticated stranger sharing one namespace.
    const store = new MemoryStorage();
    const consumer = consumerApp(store);

    await as(consumer, "alice", "/user?name=alice");
    await as(consumer, "alice", "/reset", "POST");

    for (const [path, method] of [
      ["/sessions", "GET"],
      ["/session", "GET"],
      ["/summary?session_id=x", "GET"],
      ["/identity?session_id=x", "GET"],
      ["/export/x", "GET"],
      ["/user?name=nobody", "GET"],
      ["/reset", "POST"],
    ] as const) {
      const res = await as(consumer, null, path, method);
      // Reported with the path so a failure names the route that leaked.
      expect({ path, status: res.status }).toEqual({ path, status: 401 });
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }

    // Nothing was created for, or readable as, the local owner.
    expect(await store.getSessions("local")).toHaveLength(0);
    expect(await store.getSessions("alice")).toHaveLength(1);
  });

  test("two callers do not see each other's sessions", async () => {
    const store = new MemoryStorage();
    const consumer = consumerApp(store);

    const ids: Record<string, string> = {};
    for (const who of ["alice", "bob"]) {
      await as(consumer, who, `/user?name=${who}`);
      const res = await as(consumer, who, "/reset", "POST");
      ids[who] = ((await res.json()) as { session_id: string }).session_id;
    }
    expect(ids.alice).not.toBe(ids.bob);

    for (const who of ["alice", "bob"]) {
      const mine = (await (await as(consumer, who, "/sessions")).json()) as { id: string }[];
      expect(mine.map((s) => s.id)).toEqual([ids[who]!]);
    }

    // And naming the other's session id by hand returns nothing of theirs.
    const stolen = await as(consumer, "bob", `/session?session_id=${ids.alice}`);
    expect(await stolen.json()).toMatchObject({ messages: [] });
  });

  test("with no resolver the same anonymous request is served as the local owner", async () => {
    // The contrast that makes the 401 above mean something: an identical
    // request, no injected resolver, answered exactly as it always was.
    const anonymous = await createApp().handle(new Request(url("/sessions")));
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toBeArray();
  });
});
