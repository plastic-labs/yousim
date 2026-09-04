export * from "./agents";

// Model access (per-call credentials)
export type { ModelConfig, Provider } from "./model";
export { createModelInstance, resolveModel, resolveProvider } from "./model";

// Simulation
export * from "./simulate";

// Storage. These pull in platform-specific modules (bun:sqlite, fs), which
// is why the stable surface in contract.ts does NOT come through this file.
export type { Storage, StoredSession, StoredMessage, StoredSummary } from "./storage";
export { MemoryStorage } from "./storage/memory";
export { SqliteStorage, resolveDbPath, SCHEMA_VERSION } from "./storage/sqlite";
export { createStorage } from "./storage/index";
