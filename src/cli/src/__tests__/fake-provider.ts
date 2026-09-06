/**
 * An OpenAI-compatible endpoint on loopback that records what was sent to it.
 *
 * Every other test in this repo asserts against the *missing credential* path,
 * which is what keeps the suite free and offline. That is the right default,
 * but it means nothing can see what the agents actually send — and some
 * behaviour only exists in the request body. `reset` clearing the conversation
 * is the case that needed this: the histories are internal, so "the model no
 * longer sees the old turns" is observable nowhere else.
 *
 * This does not weaken `no-live-calls.test.ts`. That guard asserts no provider
 * credential or endpoint override is visible to the *test process*, and this
 * adds neither — the override is handed to a child through `launchPty`'s
 * `extraEnv`, points at 127.0.0.1, and carries a key that is not a key.
 *
 * `PROVIDER=openai` on purpose: `PROVIDER_BASE_URLS` has no entry for it, so
 * `OPENAI_BASE_URL` is actually consulted. `openrouter` and `groq` would each
 * pin their real endpoint ahead of the override, and `anthropic` never reaches
 * this code path at all.
 */

/** One recorded call. `messages` is the whole conversation as the model saw it. */
export interface RecordedCall {
  model?: string;
  messages: { role: string; content: string }[];
}

export interface FakeProvider {
  /** Value for `OPENAI_BASE_URL`. */
  url: string;
  /** Every call so far, oldest first. */
  calls: RecordedCall[];
  /** Text the next response streams back. */
  reply: string;
  stop(): void;
}

/** One SSE frame in the Chat Completions streaming shape. */
const frame = (delta: Record<string, unknown>, finish: string | null) =>
  `data: ${JSON.stringify({
    id: "fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

export function startFakeProvider(): FakeProvider {
  const calls: RecordedCall[] = [];

  const state = { reply: "ok." };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      let body: RecordedCall;
      try {
        body = (await req.json()) as RecordedCall;
      } catch {
        return new Response("expected JSON", { status: 400 });
      }
      calls.push(body);

      // Streamed rather than returned whole: `streamText` is what the agents
      // use, and a non-streaming response would exercise a path the CLI never
      // takes.
      const body_ =
        frame({ role: "assistant", content: "" }, null) +
        frame({ content: state.reply }, null) +
        frame({}, "stop") +
        "data: [DONE]\n\n";

      return new Response(body_, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
      });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    calls,
    get reply() {
      return state.reply;
    },
    set reply(v: string) {
      state.reply = v;
    },
    stop: () => server.stop(true),
  };
}

/** Env that points a child at the fake instead of a real provider. */
export const fakeProviderEnv = (fake: FakeProvider): Record<string, string> => ({
  PROVIDER: "openai",
  OPENAI_BASE_URL: fake.url,
  // Not a credential. `createModelInstance` only checks that one is present.
  OPENAI_API_KEY: "not-a-real-key",
});
