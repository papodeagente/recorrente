import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export const ANTHROPIC_MODELS = {
  sonnet: env.ANTHROPIC_MODEL_SONNET,
  haiku: env.ANTHROPIC_MODEL_HAIKU,
} as const;
