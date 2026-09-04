import { expect, test } from "bun:test";
import { createVerifier, challengeFor, beginAuth, codeFromUrl } from "../pkce";

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
