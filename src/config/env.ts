import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  WEBHOOK_SIGNING_SECRET: z.string().min(1).default("change-me"),
  AI_INTERNAL_TOKEN: z.string().min(1).default("change-me-ai-token"),
  AI_REPLY_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  AI_CONTEXT_WINDOW: z.coerce.number().int().positive().default(12),
  AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  AI_PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  AI_PROVIDER_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_PROVIDER_MODEL: z.string().min(1).default("gpt-4o-mini"),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_SYSTEM_PROMPT: z.string().optional(),
  DATA_PROVIDER: z.enum(["inmemory", "supabase"]).default("inmemory"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
