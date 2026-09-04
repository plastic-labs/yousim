/**
 * OpenRouter OAuth PKCE — bring-your-own-key without a backend.
 *
 * The user authorizes, we exchange the code for a key OpenRouter issued to
 * *them*. We never hold a long-lived credential of our own, there is no client
 * secret, and they can revoke it from their own dashboard. Nothing here needs a
 * server.
 *
 * Runtime-portable: Web Crypto and fetch only, no Node or Bun APIs, so the same
 * code drives a browser, a CLI, and an edge runtime.
 *
 * Flow: https://openrouter.ai/docs/use-cases/oauth-pkce
 */

const AUTH_URL = "https://openrouter.ai/auth";
const KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";

/** Base64url per RFC 7636: no padding, URL-safe alphabet. */
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A fresh verifier. 32 random bytes → 43 base64url chars, comfortably inside
 * RFC 7636's 43–128 range.
 */
export function createVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** S256 challenge: base64url(sha256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export interface AuthUrlOptions {
  /** Where OpenRouter sends the user back. Omit for headless (paste) mode. */
  callbackUrl?: string;
  /** Shown to the user in their OpenRouter dashboard. Required when headless. */
  keyLabel?: string;
}

/**
 * Build the URL to send the user to, plus the verifier to keep until exchange.
 *
 * The verifier must survive the round trip (a page redirect, or a CLI waiting
 * on localhost) and must never be sent to anyone but OpenRouter.
 */
export async function beginAuth(
  options: AuthUrlOptions = {}
): Promise<{ url: string; verifier: string }> {
  const verifier = createVerifier();
  const challenge = await challengeFor(verifier);

  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  if (options.callbackUrl) {
    params.set("callback_url", options.callbackUrl);
  } else {
    // Headless: OpenRouter shows the code on screen instead of redirecting,
    // and requires a label since there's no callback to identify the app.
    params.set("key_label", options.keyLabel ?? "yousim-cli");
  }

  return { url: `${AUTH_URL}?${params}`, verifier };
}

/**
 * Exchange an authorization code for the user's API key.
 *
 * The code is single-use and expires after ~10 minutes.
 */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(KEYS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter rejected the code (${res.status}). ` +
        `Codes are single-use and expire after about 10 minutes, so try connecting again.` +
        (body ? ` Response: ${body.slice(0, 200)}` : "")
    );
  }

  const data = (await res.json()) as { key?: string };
  if (!data.key) {
    throw new Error("OpenRouter returned no key in the exchange response.");
  }
  return data.key;
}

/**
 * Read the authorization code out of a redirect URL.
 *
 * Returns null when there's no code, which is the normal case on a plain page
 * load — callers should treat that as "not returning from auth", not an error.
 */
export function codeFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
}
