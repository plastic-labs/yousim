import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type Provider = "anthropic" | "openrouter" | "openai" | "groq";

/**
 * How to reach a model for one call.
 *
 * Credentials are per-call rather than module-level so the same code runs in
 * three places: a browser holding the user's own BYOK key, a CLI reading env,
 * and a server handling a different caller on every request.
 *
 * When `apiKey` / `baseURL` are omitted the env vars are used, which is what
 * keeps the CLI and local server zero-config.
 */
export interface ModelConfig {
  provider?: Provider;
  model?: string;
  /** Per-call credential. Required in the browser; falls back to env elsewhere. */
  apiKey?: string;
  /** For OpenAI-compatible endpoints: local vLLM, an x402 inference gateway, etc. */
  baseURL?: string;
  /** Simulator output is long by nature; leaving this unset invites truncation. */
  maxOutputTokens?: number;
}

const PROVIDER_DEFAULTS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "anthropic/claude-3.5-sonnet",
  openai: "gpt-4o",
  groq: "llama-3.3-70b-versatile",
};

const PROVIDER_BASE_URLS: Partial<Record<Provider, string>> = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
};

/** Env is only consulted when the caller left a field unset. */
function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

export function resolveProvider(cfg: ModelConfig = {}): Provider {
  return cfg.provider ?? (env("PROVIDER") as Provider | undefined) ?? "anthropic";
}

export function resolveModel(cfg: ModelConfig = {}): string {
  const provider = resolveProvider(cfg);
  if (cfg.model) return cfg.model;
  if (env("MODEL")) return env("MODEL")!;
  if (provider === "openrouter" && env("OPENROUTER_MODEL")) return env("OPENROUTER_MODEL")!;
  return PROVIDER_DEFAULTS[provider];
}

/**
 * Optional fallback consulted after cfg.apiKey and env, set by surfaces that
 * have a credential store (the CLI). Injected rather than imported so this
 * module stays free of filesystem imports and usable in a browser.
 */
let credentialResolver: ((provider: Provider) => string | undefined) | null = null;

export function setCredentialResolver(fn: (provider: Provider) => string | undefined) {
  credentialResolver = fn;
}

function resolveApiKey(provider: Provider, cfg: ModelConfig): string | undefined {
  if (cfg.apiKey) return cfg.apiKey;
  const fromEnv = envKeyFor(provider);
  if (fromEnv) return fromEnv;
  return credentialResolver?.(provider);
}

function envKeyFor(provider: Provider): string | undefined {
  switch (provider) {
    case "anthropic":
      return env("ANTHROPIC_API_KEY");
    case "openrouter":
      return env("OPENROUTER_API_KEY") ?? env("OPENAI_API_KEY");
    case "openai":
      return env("OPENAI_API_KEY");
    case "groq":
      return env("GROQ_API_KEY");
  }
}

/**
 * Build a model instance for one call.
 *
 * Providers are constructed per-call, not cached at module load, because the
 * credential varies by caller. The AI SDK clients are cheap to create.
 */
export function createModelInstance(cfg: ModelConfig = {}): LanguageModel {
  const provider = resolveProvider(cfg);
  const model = resolveModel(cfg);
  const apiKey = resolveApiKey(provider, cfg);

  if (!apiKey) {
    throw new Error(
      `No API key for provider "${provider}". Either run \`yousim connect\` to link ` +
        `an OpenRouter account, pass ModelConfig.apiKey, or set the matching env var.`
    );
  }

  if (provider === "anthropic") {
    return createAnthropic({ apiKey })(model);
  }

  const baseURL = cfg.baseURL ?? PROVIDER_BASE_URLS[provider] ?? env("OPENAI_BASE_URL");
  // .chat() forces the Chat Completions shape, which is what OpenAI-compatible
  // servers (vLLM, gateways) actually implement.
  return createOpenAI({ apiKey, baseURL }).chat(model);
}
