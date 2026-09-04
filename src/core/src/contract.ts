/**
 * The stable public surface of this package.
 *
 * Everything re-exported here is safe for a downstream consumer to depend on.
 * Anything not listed is internal and may change without notice, so import
 * from this module rather than reaching into paths directly. Adding to this
 * file is a commitment; keep it small.
 *
 * Out of scope by design: authentication, billing, and anything else that
 * needs server-side state. This package runs entirely on the caller's own
 * machine and credentials.
 */

// ---------------------------------------------------------------------------
// Conversation data
//
// Implemented by: SqliteStorage (CLI), a browser IndexedDB store (local web
// UI), and the hosted service's own backend. These never substitute for each
// other at runtime — each surface has exactly one — so the interface exists to
// pin the *shape*, not to enable swapping.
// ---------------------------------------------------------------------------
export type {
  Storage,
  StoredSession,
  StoredMessage,
  StoredSummary,
} from "./storage";

// ---------------------------------------------------------------------------
// Model access
//
// Credentials are per-call, never module-level. This is what lets one codebase
// serve a browser holding the user's BYOK key, a CLI reading env vars, and a
// server handling a different caller on every request.
// ---------------------------------------------------------------------------
export type { ModelConfig, Provider } from "./model";
export { createModelInstance, resolveModel, resolveProvider } from "./model";

// ---------------------------------------------------------------------------
// The product itself: prompt-building agents.
//
// These are pure — they build message arrays and call one streaming helper.
// A hosted service must be able to instantiate them unchanged; if it can't,
// the contract is broken.
// ---------------------------------------------------------------------------
export type { Message } from "./agents";
export {
  GaslitClaude,
  Simulator,
  Constructor,
  Summary,
  SummaryFollowUp,
  Identity,
} from "./agents";

// ---------------------------------------------------------------------------
// Client extension seam: meta-commands.
//
// `parseInput` MUST be shared — if two surfaces classify input differently,
// the same text behaves differently depending on where it was typed. The
// registry is per-surface: a browser cannot open a localhost listener, and a
// local install has no account to log into. Some commands (`connect`) share a
// name and description across surfaces while needing a different `run`.
// ---------------------------------------------------------------------------
export type { ParsedInput, MetaCommand, MetaCommandResult } from "./commands";
export { parseInput, buildRegistry, renderHelp } from "./commands";

export type { ModelPreset } from "./models";
export { MODEL_PRESETS, defaultModelFor, checkModelId } from "./models";

export { simulate } from "./simulate";
export { INITIAL_PROMPT, INITIAL_RESPONSE } from "./simulate";

// ---------------------------------------------------------------------------
// Wire format
//
// Shared by the local web UI and the hosted API so one frontend can talk to
// either. Kept structural (no classes, no runtime validation) so a consumer
// can validate however it likes.
// ---------------------------------------------------------------------------

/** A turn in any mode. `session_id` absent means "start a new session". */
export interface TurnRequest {
  session_id?: string;
  message: string;
  /** Omitted by the hosted service when the caller supplies credentials. */
  model?: import("./model").ModelConfig;
}

export interface TurnResponse {
  session_id: string;
  response: string;
  turn: number;
  done: boolean;
}

/** Bounded autonomous searcher/simulator run. Turn count is the cost bound. */
export interface ExploreRequest {
  name: string;
  insights?: string;
  turns: number;
  model?: import("./model").ModelConfig;
}

export interface ExploreResponse {
  session_id: string;
  transcript: { role: "searcher" | "simulator"; content: string }[];
  turns_completed: number;
  /** True when stopped early (cap, timeout, or upstream error). */
  truncated: boolean;
}

/** Contract version. Bump on any breaking change to the above. */
export const CONTRACT_VERSION = "0.1.0";
