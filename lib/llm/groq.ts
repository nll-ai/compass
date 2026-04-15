import { createGroq } from "@ai-sdk/groq";

/**
 * Primary Groq model: **GPT-OSS 120B** (`gpt-oss-120b`).
 * Groq’s API model id uses the `openai/` prefix — see
 * https://console.groq.com/docs/model/openai/gpt-oss-120b
 */
export const GROQ_DEFAULT_MODEL_ID = "openai/gpt-oss-120b";

/** Fast path: agents, filtering, small tasks. Override with `GROQ_MODEL_FAST`. */
export const groqModelFastId = (): string => process.env.GROQ_MODEL_FAST ?? GROQ_DEFAULT_MODEL_ID;

/** Heavier synthesis (digest, structured JSON). Override with `GROQ_MODEL_SMART`. */
export const groqModelSmartId = (): string => process.env.GROQ_MODEL_SMART ?? GROQ_DEFAULT_MODEL_ID;

export function hasGroqApiKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/**
 * Groq chat model for the AI SDK (`generateText`, `generateObject`, agents, etc.).
 * @param modelId e.g. `openai/gpt-oss-120b` ({@link GROQ_DEFAULT_MODEL_ID})
 */
export function createGroqModel(modelId: string, apiKey: string) {
  return createGroq({ apiKey })(modelId);
}
