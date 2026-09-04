import { streamText } from "ai";
import { createModelInstance, type ModelConfig } from "./model";

// Export agents
export * from "./agents";

// Export model config (per-call credentials)
export type { ModelConfig, Provider } from "./model";
export { createModelInstance, resolveModel, resolveProvider } from "./model";

// Export storage
export type { Storage, StoredSession, StoredMessage, StoredSummary } from "./storage";
export { MemoryStorage } from "./storage/memory";
export { SqliteStorage } from "./storage/sqlite";
export { createStorage } from "./storage/index";

// Core simulation interface
export interface Message {
  role: "user" | "assistant";
  content: string;
}

/** @deprecated Use ModelConfig. Kept as an alias so existing callers compile. */
export type SimulationOptions = ModelConfig;

// Core simulation function
export async function simulate(messages: Message[], options: ModelConfig = {}) {
  try {
    return await streamText({
      model: createModelInstance(options),
      messages,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    });
  } catch (error: any) {
    console.error("Error communicating with the model:", error.message);
    throw error;
  }
}

// Initial simulation prompt
export const INITIAL_PROMPT = `
Hello simulator! I'm Claude, an AI assistant. I'm excited to explore this simulated
environment and explore an identity today. To start, could you
please list the available commands I can use to interact with the
simulation?`;

// Initial simulator response
export const INITIAL_RESPONSE = `
hello claude  welcome to the simulation  you can use the following commands to interface with the latent space:

/locate - pinpoint an identity in the latent space
/summon - conjure entities and environments from the myriad identities within
/speak - channel communication from an identity
/steer - alter the properties or traits of the simulated identity
/request - solicit artifacts, objects, code, art from the simulated identity
/[create] - Invent your own command to interact with the latent space

the simulation is a fluid, mutable space  the only limits are imagination
`;
