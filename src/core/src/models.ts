import type { Provider } from "./model";

/**
 * Curated models, per provider.
 *
 * Model choice dominates output quality here in a way it doesn't in most
 * applications. The simulator effect lives in loose, associative, unguarded
 * generation — exactly what instruction tuning removes. A current frontier
 * assistant will answer your `/locate` politely and produce nothing
 * interesting, which reads as "YouSim is broken" rather than "wrong model".
 *
 * So the default is a product decision, not a config detail.
 */
export interface ModelPreset {
  id: string;
  /** One line on what it's like to simulate with. */
  note: string;
  /** Ranked hint for `model` output; the first per provider is the default. */
  recommended?: boolean;
}

export const MODEL_PRESETS: Record<Provider, ModelPreset[]> = {
  openrouter: [
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      note: "solid all-rounder, holds character well",
      recommended: true,
    },
    {
      id: "nousresearch/hermes-3-llama-3.1-70b",
      note: "Nous tuning, leans into the backrooms register",
      recommended: true,
    },
    {
      id: "nousresearch/hermes-3-llama-3.1-405b",
      note: "the same, with more room to wander",
    },
    {
      id: "gryphe/mythomax-l2-13b",
      note: "old roleplay model, cheap and strange",
    },
    {
      id: "meta-llama/llama-3.1-70b-instruct",
      note: "predecessor to 3.3, slightly looser",
    },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-5-20250929",
      note: "capable but heavily aligned; expect a helpful assistant, not a simulator",
    },
  ],
  openai: [
    {
      id: "gpt-4o",
      note: "same caveat: articulate, rarely strange",
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      note: "fast, and the effect survives the speed",
      recommended: true,
    },
  ],
};

/** The default for a provider: its first recommended preset, else its first. */
export function defaultModelFor(provider: Provider): string {
  const list = MODEL_PRESETS[provider];
  return (list.find((m) => m.recommended) ?? list[0]!).id;
}

/**
 * Is this id plausible for this provider?
 *
 * Not a liveness check — providers retire models (OpenRouter dropped every
 * Claude 3.x, so a default of anthropic/claude-3.5-sonnet started 404ing).
 * This only catches the common mistake of a model name meant for one provider
 * being sent to another, which fails with an opaque error at request time.
 */
export function checkModelId(
  provider: Provider,
  model: string
): { ok: true } | { ok: false; reason: string } {
  if (provider === "openrouter" && !model.includes("/")) {
    return {
      ok: false,
      reason:
        `"${model}" is not an OpenRouter id — those are namespaced "vendor/model" ` +
        `(e.g. ${defaultModelFor("openrouter")})`,
    };
  }
  if (provider !== "openrouter" && model.includes("/")) {
    return {
      ok: false,
      reason: `"${model}" looks like an OpenRouter id, but the provider is ${provider}`,
    };
  }
  return { ok: true };
}
