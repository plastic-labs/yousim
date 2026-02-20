import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthMode = "supabase" | "apikey" | "local";

export interface AuthResult {
  userId: string;
}

/**
 * Detect which auth mode is active based on environment variables.
 */
export function detectAuthMode(): AuthMode {
  if (process.env.SUPABASE_URL) return "supabase";
  if (process.env.YOUSIM_API_KEY) return "apikey";
  return "local";
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer: string | null = null;

function getSupabaseJwks(): { jwks: ReturnType<typeof createRemoteJWKSet>; issuer: string } {
  if (!jwks || !issuer) {
    const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/+$/, "");
    issuer =
      process.env.SUPABASE_JWT_ISSUER || `${supabaseUrl}/auth/v1`;
    const jwksUrl =
      process.env.SUPABASE_JWKS_URL || `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return { jwks, issuer };
}

/**
 * Resolve user ID from the Authorization header based on the current auth mode.
 *
 * - local: No auth needed, returns "local"
 * - apikey: Bearer token must match YOUSIM_API_KEY, returns "api-user"
 * - supabase: JWT verification via JWKS, returns payload.sub
 */
export async function resolveUser(
  authHeader: string | undefined,
  mode: AuthMode
): Promise<AuthResult | null> {
  if (mode === "local") {
    return { userId: "local" };
  }

  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

  if (!token) return null;

  if (mode === "apikey") {
    if (token === process.env.YOUSIM_API_KEY) {
      return { userId: "api-user" };
    }
    return null;
  }

  // supabase mode
  try {
    const { jwks, issuer } = getSupabaseJwks();
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!payload?.sub) return null;
    return { userId: payload.sub as string };
  } catch (error) {
    console.error("JWT verification error:", error);
    return null;
  }
}

/**
 * Get the raw token from the auth header (for Supabase RLS pass-through).
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}
