import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

// Export agents
export * from "./agents";

// Initialize clients for different providers
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "placeholder",
});

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "placeholder",
});

// Core simulation interface
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface SimulationOptions {
  provider?: string;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

function resolveModel(provider: string, explicitModel?: string): string {
  if (explicitModel) {
    return explicitModel;
  }

  if (process.env.MODEL) {
    return process.env.MODEL;
  }

  if (provider === "openrouter" && process.env.OPENROUTER_MODEL) {
    return process.env.OPENROUTER_MODEL;
  }

  return DEFAULT_MODEL;
}

// Core simulation function
export async function simulate(messages: Message[], options: SimulationOptions = {}) {
  const provider = options.provider || process.env.PROVIDER || "anthropic";
  const model = resolveModel(provider, options.model);
  
  let modelInstance;
  
  if (provider === "anthropic") {
    modelInstance = anthropic(model);
  } else if (provider === "openrouter") {
    modelInstance = openrouter(model);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  try {
    const stream = await streamText({
      model: modelInstance,
      messages: messages,
    });

    return stream;
  } catch (error) {
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
