import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // LLM
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL_SONNET: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_HAIKU: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MODEL_OPUS: z.string().default("claude-opus-4-7"),

  // Áudio (Whisper)
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_WHISPER_MODEL: z.string().default("whisper-1"),

  // Storage
  STORAGE_DIR: z.string().default("/app/storage"),
  STORAGE_PUBLIC_URL: z.string().default("/storage"),

  // Auth
  AUTH_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().default("bolso_session"),

  // App
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RUNTIME_ROLE: z.enum(["web", "worker"]).default("web"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export type Env = typeof env;
