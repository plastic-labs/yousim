import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { node } from "@elysiajs/node";
import path from "path";
import { existsSync, readFileSync } from "fs";
import {
  Message,
  GaslitClaude,
  Simulator,
  Constructor,
  Summary,
  Identity,
  INITIAL_PROMPT,
  INITIAL_RESPONSE,
  createStorage,
} from "@yousim/core";
import type { Storage } from "@yousim/core";
import { detectDone } from "./detect-done";
import { formatIdentityMd, formatSoulMd } from "./formatters";

// --- Storage ---
//
// This server is a single-user local instance: it runs on your machine
// against your own data, so there is no auth and one owner. A hosted
// deployment implements its own auth and storage instead.

const LOCAL_USER = "local";

let _storage: Storage | null = null;
function getStorage(): Storage {
  if (!_storage) {
    _storage = createStorage("sqlite");
  }
  return _storage;
}

// `import.meta.dirname`, not Bun's `import.meta.dir`: the standard spelling,
// and both runtimes implement it.
const publicDir = path.resolve(import.meta.dirname, "../public");

// Types for request bodies
interface ManualRequest {
  session_id: string;
  command: string;
}

interface ChatRequest extends ManualRequest {
  original_session_id: string;
  summary_id: string;
  summary_message_id: string;
  prompt?: Array<Record<string, any>>;
}

/**
 * Origins allowed to call this server.
 *
 * `cors()` with no options reflects back whatever Origin the caller sends and
 * pairs it with Allow-Credentials. On a server where every request is already
 * the local owner, that means any page the user happens to have open can read
 * their sessions, delete them, and spend their model credit. The built frontend
 * is served from this same origin and needs no allowance at all — this exists
 * for `bun run dev`, where Vite serves the frontend from a second port.
 */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const createApp = () => {
  // `@elysiajs/node` on BOTH runtimes, not just on Node.
  //
  // Elysia's default adapter is `Bun.serve`, which does not exist under Node.
  // Rather than choose an adapter per runtime, this uses the Node one
  // everywhere: it is built on `node:http`, which Bun implements, so one
  // adapter means one code path and one set of behaviours to reason about
  // instead of two that have to be kept in agreement. This is a local,
  // single-user tool — the throughput the Bun adapter would buy back is not
  // worth a second server implementation nobody tests.
  const app = new Elysia({ adapter: node() })
    .use(cors({ origin: LOCAL_ORIGIN }))
    .derive(() => ({ userId: LOCAL_USER, storage: getStorage() }))
    // Not "Bun/Elysia version" any more: this server runs on Node as well,
    // and a health endpoint that names the wrong runtime is a small lie in the
    // one place people look when they are already confused.
    .get("/api/health", () => "YouSim API - Elysia")
    .get("/api/mode", () => ({ auth: "local" as const }))
    .get("/user", async ({ query, set, userId, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { name } = query as { name: string };
      if (!name) {
        set.status = 400;
        return { error: "Name is required" };
      }

      try {
        const data = await storage.upsertUser(userId, name);
        return { user_id: data.id };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .post("/manual", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id, command } = body as ManualRequest;

      try {
        // Get session messages
        const messages = await storage.getMessages(session_id, userId);

        // Store user message
        await storage.insertMessage(session_id, userId, command, true);

        // Resolve session metadata (name)
        const session = await storage.getSession(session_id, userId);
        const name = session?.metadata?.name || "";

        // Convert messages to simulator history
        const simulatorHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "user" : "assistant" as const,
          content: msg.content,
        }));

        if (simulatorHistory.length === 0) {
          simulatorHistory.push(
            { role: "user", content: INITIAL_PROMPT },
            { role: "assistant", content: INITIAL_RESPONSE }
          );
        }

        const simulator = new Simulator({
          name,
          history: [...simulatorHistory, { role: "user", content: command }],
        });

        let responseText = "";
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of simulator.stream()) {
                responseText += chunk;
                controller.enqueue(chunk);
              }

              await storage.insertMessage(session_id, userId, responseText, false);
              controller.close();
            } catch (streamError: any) {
              console.error("Error in simulation stream:", streamError);
              controller.error(streamError);
            }
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/plain" },
        });
      } catch (error: any) {
        console.error("Error in simulation:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.String(),
        command: t.String(),
      }),
    })
    .post("/auto", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = body as { session_id: string };

      try {
        const messages = await storage.getMessages(session_id, userId);

        // Convert to gaslit history (roles swapped)
        const gaslitHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "assistant" : "user" as const,
          content: msg.content,
        }));

        const session = await storage.getSession(session_id, userId);
        const name = session?.metadata?.name || "";
        const insights = session?.metadata?.insights || "";

        const gaslitClaude = new GaslitClaude({
          name,
          insights,
          history: gaslitHistory,
        });

        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of gaslitClaude.stream()) {
                controller.enqueue(chunk);
              }
              controller.close();
            } catch (streamError: any) {
              console.error("Error in auto stream:", streamError);
              controller.error(streamError);
            }
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/plain" },
        });
      } catch (error: any) {
        console.error("Error in auto:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.String(),
      }),
    })
    .post("/constructor", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id, command } = body as ManualRequest;

      try {
        const messages = await storage.getMessages(session_id, userId);

        const constructorHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "user" : "assistant" as const,
          content: msg.content,
        }));

        const constructor = new Constructor({ history: constructorHistory });
        constructor.history.push({ role: "user", content: command });

        let constructorResponse = "";
        for await (const chunk of constructor.stream()) {
          constructorResponse += chunk;
        }

        // Store user message
        await storage.insertMessage(session_id, userId, command, true);

        // Store constructor response
        await storage.insertMessage(session_id, userId, constructorResponse, false);

        // Generate and store summary
        const summaryAgent = new Summary({
          history: [
            ...constructorHistory,
            { role: "user", content: command },
            { role: "assistant", content: constructorResponse },
          ],
        });

        const summaryText = await summaryAgent.generate();
        await storage.insertSummary(session_id, userId, summaryText);

        return new Response(constructorResponse, {
          headers: {
            "Content-Type": "text/plain",
            "Transfer-Encoding": "chunked",
          },
        });
      } catch (error: any) {
        console.error("Error in constructor:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.String(),
        command: t.String(),
      }),
    })
    .get("/summary", async ({ query, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = query as { session_id: string };

      try {
        const data = await storage.getSummaries(session_id, userId);
        return data;
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .get("/identity", async ({ query, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = query as { session_id: string };

      try {
        const summary = await storage.getLatestSummary(session_id, userId);

        if (!summary) {
          set.status = 404;
          return { error: "Summary not found" };
        }

        const identity = new Identity(summary.content, "");
        await identity.initialize();
        const prompt = identity.getPrompt();

        return prompt;
      } catch (error: any) {
        console.error("Error in identity:", error);
        set.status = 500;
        return { error: error.message };
      }
    })
    .post("/chat", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const {
        session_id,
        command,
        original_session_id,
        summary_id,
        summary_message_id,
        prompt,
      } = body as ChatRequest;

      try {
        const summary = await storage.getLatestSummary(original_session_id, userId);

        if (!summary) {
          set.status = 404;
          return { error: "Summary not found" };
        }

        const session = await storage.getSession(session_id, userId);
        if (!session) {
          set.status = 400;
          return { error: "Invalid chat session" };
        }

        // Get or use cached identity prompt
        let identityPrompt = prompt;
        if (!identityPrompt && session.metadata?.identity_prompt) {
          identityPrompt = session.metadata.identity_prompt;
        }

        const messages = await storage.getMessages(session_id, userId);

        const chatHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "user" : "assistant" as const,
          content: msg.content,
        }));

        const identity = new Identity(summary.content, command, identityPrompt as any);
        identity.history = chatHistory;

        if (!identityPrompt) {
          await identity.initialize();
        }

        let responseText = "";
        for await (const chunk of identity.stream()) {
          responseText += chunk;
        }

        // Store messages
        await storage.insertMessage(session_id, userId, command, true);
        await storage.insertMessage(session_id, userId, responseText, false);

        // Cache prompt if not already cached
        if (!session.metadata?.identity_prompt) {
          await storage.updateSessionMetadata(session_id, userId, {
            ...session.metadata,
            identity_prompt: identity.getPrompt(),
            constructor_session_id: original_session_id,
            summary_id: summary_id,
          });
        }

        return new Response(responseText, {
          headers: {
            "Content-Type": "text/plain",
            "Transfer-Encoding": "chunked",
          },
        });
      } catch (error: any) {
        console.error("Error in chat:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.String(),
        command: t.String(),
        original_session_id: t.String(),
        summary_id: t.String(),
        summary_message_id: t.String(),
        prompt: t.Optional(
          t.Array(
            t.Object({
              role: t.String(),
              content: t.String(),
            })
          )
        ),
      }),
    })
    .post("/reset", async ({ query, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id, mode } = query as { session_id?: string; mode?: string };

      try {
        if (session_id) {
          await storage.deleteSession(session_id, userId);
        }

        const metadata = mode ? { mode } : {};
        const data = await storage.createSession(userId, metadata);

        return {
          user_id: userId,
          session_id: data.id,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .get("/session", async ({ query, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = query as { session_id?: string };

      try {
        let resolved_session_id = session_id;

        if (!resolved_session_id) {
          const sessions = await storage.getSessions(userId);
          if (sessions.length === 0) {
            set.status = 404;
            return { error: "No sessions found" };
          }
          resolved_session_id = sessions[0].id;
        }

        const messages = await storage.getMessages(resolved_session_id, userId);

        return {
          session_id: resolved_session_id,
          messages: messages.map((msg) => ({
            id: msg.id,
            content: msg.content,
            created_at: msg.created_at,
            is_user: msg.is_user,
          })),
        };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .get("/sessions", async ({ query, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { mode } = query as { mode?: string };

      try {
        const sessions = await storage.getSessions(userId, mode);
        return sessions;
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .put("/sessions/:session_id/metadata", async ({ params, body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = params;
      const metadata = body as Record<string, any>;

      try {
        const data = await storage.updateSessionMetadata(session_id, userId, metadata);
        return {
          session_id: data.id,
          metadata: data.metadata,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    .get("/export/:session_id", async ({ params, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id } = params;

      try {
        const messages = await storage.getMessages(session_id, userId);

        const formatted_messages = messages.map((msg) => ({
          role: msg.is_user ? "user" : "assistant",
          content: msg.content,
        }));

        return new Response(JSON.stringify(formatted_messages, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="yousim_conversation_${session_id}.json"`,
          },
        });
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    // ─── v1/construct API ─────────────────────────────────────────────────
    .post("/v1/construct", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id, message } = body as { session_id?: string; message: string };

      try {
        let sid = session_id;

        // Create a new constructor session if none provided
        if (!sid) {
          const session = await storage.createSession(userId, { mode: "constructor" });
          sid = session.id;
        }

        const messages = await storage.getMessages(sid, userId);

        const constructorHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "user" : ("assistant" as const),
          content: msg.content,
        }));

        const constructor = new Constructor({ history: constructorHistory });
        constructor.history.push({ role: "user", content: message });

        let constructorResponse = "";
        for await (const chunk of constructor.stream()) {
          constructorResponse += chunk;
        }

        await storage.insertMessage(sid, userId, message, true);
        await storage.insertMessage(sid, userId, constructorResponse, false);

        // Check if done
        const turnCount = Math.floor((messages.length + 2) / 2); // user+assistant pairs
        const done = detectDone(constructorResponse, turnCount);

        return {
          session_id: sid,
          response: constructorResponse,
          turn: turnCount,
          done,
        };
      } catch (error: any) {
        console.error("Error in v1/construct:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.Optional(t.String()),
        message: t.String(),
      }),
    })
    .post("/v1/construct/summary", async ({ body, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { session_id, name } = body as { session_id: string; name?: string };

      try {
        const messages = await storage.getMessages(session_id, userId);

        if (messages.length === 0) {
          set.status = 400;
          return { error: "No messages in session" };
        }

        const constructorHistory: Message[] = messages.map((msg) => ({
          role: msg.is_user ? "user" : ("assistant" as const),
          content: msg.content,
        }));

        const summaryAgent = new Summary({ history: constructorHistory });
        const summaryText = await summaryAgent.generate();

        await storage.insertSummary(session_id, userId, summaryText);

        const identityName = name || "unnamed";
        const identityMd = formatIdentityMd(identityName, summaryText);
        const soulMd = formatSoulMd(summaryText);

        return {
          session_id,
          summary: summaryText,
          identity_md: identityMd,
          soul_md: soulMd,
        };
      } catch (error: any) {
        console.error("Error in v1/construct/summary:", error);
        set.status = 500;
        return { error: error.message };
      }
    }, {
      body: t.Object({
        session_id: t.String(),
        name: t.Optional(t.String()),
      }),
    })
    .get("/v1/construct/:id", async ({ params, userId, set, storage }) => {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { id } = params;

      try {
        const session = await storage.getSession(id, userId);
        if (!session) {
          set.status = 404;
          return { error: "Session not found" };
        }

        const messages = await storage.getMessages(id, userId);
        const summary = await storage.getLatestSummary(id, userId);

        return {
          session_id: id,
          messages: messages.map((msg) => ({
            role: msg.is_user ? "user" : "assistant",
            content: msg.content,
          })),
          turn: Math.floor(messages.length / 2),
          summary: summary?.content || null,
          metadata: session.metadata,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    })
    // Serve static assets from the built frontend
    .use(
      staticPlugin({
        assets: path.join(publicDir, "assets"),
        prefix: "/assets",
        alwaysStatic: false,
      })
    )
    // SPA fallback - serve index.html for all unmatched routes
    .get("/*", () => {
      // `readFileSync` rather than `Bun.file`. A `BunFile` is a Bun-only lazy
      // handle that only the Bun adapter knows how to unwrap; under the Node
      // adapter it would serialize as an empty object and the UI would load a
      // blank page. index.html is a few KB, so reading it costs nothing worth
      // measuring.
      return new Response(readFileSync(path.join(publicDir, "index.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    });

  return app;
};

export const startServer = async () => {
  // publicDir is resolved from import.meta.dirname, which points inside the
  // embedded bundle in a `bun build --compile` binary — so the frontend
  // assets are not there. Elysia reports any listen failure as "Is port N in
  // use?", which sends you chasing a port conflict that doesn't exist.
  if (!existsSync(publicDir)) {
    throw new Error(
      `Frontend assets not found at ${publicDir}. Run \`bun run build\` in ` +
        `src/web, or use the CLI instead of \`server\` — a compiled ` +
        `standalone binary cannot serve them.`
    );
  }

  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  // Loopback unless asked otherwise. There is no auth here by design, so a
  // wildcard bind would put every session on this machine within reach of
  // anyone on the same network. A container is the one case that genuinely
  // needs 0.0.0.0, since a published port cannot reach loopback inside it.
  //
  // The key must be `hostname`. The adapter's own option is `host`, but it is
  // reached through srvx, which translates `hostname` -> `host` and *drops* an
  // unrecognised `host` — leaving the bind wide open on 0.0.0.0. Verified in
  // both directions; do not "simplify" this to `host`.
  const hostname = process.env.HOST || "127.0.0.1";

  const url = await new Promise<string>((resolve, reject) => {
    app.listen({ port, hostname }, (server) => {
      // The address is only knowable once the socket is up, and with PORT=0
      // the reported port is the requested 0 until then. `raw` is the srvx
      // server; awaiting its `ready()` and reading `url` is the one way to get
      // the *resolved* host and port, and it works the same on both runtimes.
      // Reported rather than echoed back from `hostname` above, so the line
      // below is evidence of what was bound instead of a restatement of what
      // was asked for.
      const raw = (server as unknown as { raw?: { ready?: () => Promise<unknown>; url?: string } }).raw;
      Promise.resolve(raw?.ready?.()).then(
        () => (raw?.url ? resolve(raw.url) : reject(new Error("server reported no address"))),
        reject
      );
    });
  });

  console.log(`YouSim API is running at ${url}`);
  console.log(`Storage: ${process.env.YOUSIM_DB ?? "~/.yousim/yousim.db"}`);
  return app;
};

if (import.meta.main) {
  await startServer();
}
