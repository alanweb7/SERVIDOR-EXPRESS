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
  DATA_PROVIDER: z.enum(["inmemory", "supabase"]).default("inmemory"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
