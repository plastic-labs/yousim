import { expect, test, afterEach } from "bun:test";
import { createVerifier, challengeFor, beginAuth, codeFromUrl, exchangeCode } from "../pkce";

test("S256 challenge matches the RFC 7636 reference vector", async () => {
  // Appendix B of RFC 7636. If this breaks, the exchange fails at OpenRouter
  // with an opaque error, so pin it against the spec rather than ourselves.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  expect(await challengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("verifier is base64url and within the RFC length range", () => {
  for (let i = 0; i < 20; i++) {
    const v = createVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/); // no +, /, or = padding
  }
});

test("verifiers are not reused", () => {
  const seen = new Set(Array.from({ length: 50 }, () => createVerifier()));
  expect(seen.size).toBe(50);
});

test("callback flow sends callback_url and S256, not a key label", async () => {
  const { url, verifier } = await beginAuth({ callbackUrl: "http://localhost:1234/callback" });
  const p = new URL(url).searchParams;
  expect(new URL(url).origin + new URL(url).pathname).toBe("https://openrouter.ai/auth");
  expect(p.get("callback_url")).toBe("http://localhost:1234/callback");
  expect(p.get("code_challenge_method")).toBe("S256");
  expect(p.get("code_challenge")).toBe(await challengeFor(verifier));
  expect(p.get("key_label")).toBeNull();
});

test("headless flow sends key_label instead of callback_url", async () => {
  const { url } = await beginAuth({ keyLabel: "my-label" });
  const p = new URL(url).searchParams;
  expect(p.get("key_label")).toBe("my-label");
  expect(p.get("callback_url")).toBeNull();
  expect(p.get("code_challenge_method")).toBe("S256");
});

test("the challenge sent is derived from the verifier we keep", async () => {
  // The whole point of PKCE: a challenge that doesn't match its verifier means
  // an intercepted code is useless.
  const { url, verifier } = await beginAuth({ callbackUrl: "http://x/cb" });
  const sent = new URL(url).searchParams.get("code_challenge");
  expect(sent).toBe(await challengeFor(verifier));
  expect(sent).not.toBe(verifier);
});

test("codeFromUrl extracts a code, and returns null rather than throwing", () => {
  expect(codeFromUrl("http://localhost:3000/cb?code=abc123")).toBe("abc123");
  expect(codeFromUrl("http://localhost:3000/cb")).toBeNull();
  expect(codeFromUrl("not a url at all")).toBeNull();
  expect(codeFromUrl("")).toBeNull();
});

// ─── exchangeCode ──────────────────────────────────────────────────────────
//
// The last step of the OAuth flow and the only one that has ever held the
// user's key in a variable, and it had no test at all. That is also what the
// pkce.ts coverage anomaly turned out to be: with this function present but
// never called, Bun's line-hit table for the whole module collapsed onto one
// anchor line, and pkce.ts reported 7% lines against 87% functions. Line 15,
// a module-scope `const`, was credited with 46 hits; line 105, inside this
// function, was credited with 1 hit despite never running. Exercising the
// function takes the file to ~89% and the phantom numbers disappear. It was a
// reporter artifact on top of a real gap, and closing the gap clears both.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub fetch, recording what the exchange actually sent. */
function stubFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return response;
  }) as typeof fetch;
  return calls;
}

test("the exchange posts the code and the verifier, and nothing else", async () => {
  const calls = stubFetch(new Response(JSON.stringify({ key: "sk-or-v1-issued" })));

  expect(await exchangeCode("the-code", "the-verifier")).toBe("sk-or-v1-issued");
  expect(calls).toHaveLength(1);

  const [call] = calls;
  expect(call.url).toBe("https://openrouter.ai/api/v1/auth/keys");
  expect(call.init.method).toBe("POST");
  const body = JSON.parse(String(call.init.body));
  expect(body).toEqual({
    code: "the-code",
    code_verifier: "the-verifier",
    code_challenge_method: "S256",
  });
});

test("a rejected code throws a message that explains the expiry, not a bare status", async () => {
  // Codes are single-use and expire in ~10 minutes, so the overwhelmingly
  // likely cause of a failure here is a stale code. A bare "400" sends the
  // user looking for a bug in the tool instead of running connect again.
  stubFetch(new Response("nope", { status: 400 }));
  await expect(exchangeCode("stale", "v")).rejects.toThrow(/expire|single-use/i);
});

test("the error does not echo an unbounded upstream body", async () => {
  // The response is attacker-influenced text heading for the user's terminal.
  stubFetch(new Response("x".repeat(5000), { status: 500 }));
  const err = await exchangeCode("c", "v").then(
    () => null,
    (e: Error) => e
  );
  expect(err).toBeInstanceOf(Error);
  expect(err!.message.length).toBeLessThan(500);
});

test("the verifier is never echoed into the error message", async () => {
  // The verifier is the secret half of PKCE. It goes to OpenRouter and nowhere
  // else — not into a log line, not into a thrown message a caller may print.
  stubFetch(new Response("bad", { status: 403 }));
  const err = await exchangeCode("c", "SECRET-VERIFIER-VALUE").then(
    () => null,
    (e: Error) => e
  );
  expect(err!.message).not.toContain("SECRET-VERIFIER-VALUE");
});

test("a 200 with no key is an error, not an undefined credential", async () => {
  // Returning undefined here would be stored as a connected account with an
  // empty key, and the failure would surface much later as a 401.
  stubFetch(new Response(JSON.stringify({ ok: true })));
  await expect(exchangeCode("c", "v")).rejects.toThrow(/no key/i);
});
