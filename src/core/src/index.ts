export * from "./agents";

// Model access (per-call credentials)
export type { ModelConfig, Provider } from "./model";
export { createModelInstance, resolveModel, resolveProvider, setCredentialResolver } from "./model";

// BYOK auth (portable: Web Crypto + fetch only)
export * from "./pkce";

// Config resolution and paths (Bun/Node only)
export * from "./config";

// Local credential storage (Bun/Node only)
export * from "./credentials";

// Meta-command classification and registry
export * from "./commands";

// Model presets
export * from "./models";

// Provider error explanation
export * from "./errors";

// Simulation
export * from "./simulate";

// Storage. These pull in platform-specific modules (bun:sqlite, fs), which
// is why the stable surface in contract.ts does NOT come through this file.
export type { Storage, StoredSession, StoredMessage, StoredSummary } from "./storage";
export { MemoryStorage } from "./storage/memory";
export { SqliteStorage, resolveDbPath, SCHEMA_VERSION } from "./storage/sqlite";
export { createStorage } from "./storage/index";
