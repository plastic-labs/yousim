import { streamText } from "ai";
import { createModelInstance, type ModelConfig } from "./model";
import type { Message } from "./agents";
import { explainProviderError } from "./errors";

// Runtime-portable: this module must never import a store implementation,
// so it stays usable from a browser and an edge runtime.
// Message is defined in agents.ts and re-exported here so callers can get
// the whole simulation surface from one module.
export type { Message } from "./agents";

/** @deprecated Use ModelConfig. Kept as an alias so existing callers compile. */
export type SimulationOptions = ModelConfig;

// Core simulation function
export async function simulate(messages: Message[], options: ModelConfig = {}) {
  try {
    return await streamText({
      model: createModelInstance(options),
      messages,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
      // Callers consume the stream themselves, so surface the failure rather
      // than letting the SDK log it and end the stream empty.
      onError: ({ error }) => {
        console.error(explainProviderError(error));
      },
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
