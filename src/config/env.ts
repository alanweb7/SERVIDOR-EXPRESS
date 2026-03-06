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
  ADMIN_MANAGER_TOKEN: z.string().min(1).default("change-me-admin-token"),
  AI_CONTEXT_WINDOW: z.coerce.number().int().positive().default(12),
  AI_TRANSIENT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  OPENCLAW_GATEWAY_URL: z.string().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_AGENT_ID: z.string().min(1).optional(),
  OPENCLAW_SESSION_DEFAULT: z.string().optional(),
  OPENCLAW_DEVICE_ID: z.string().min(1).default("lab-api-main"),
  OPENCLAW_DEVICE_IDENTITY_PATH: z.string().default("/app/.openclaw/device-identity.json"),
  OPENCLAW_ENABLE_FALLBACK_CLI: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPENCLAW_FALLBACK_CONTAINER: z.string().default("openclaw-cvsy-openclaw-1"),
  OPENCLAW_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  OPENCLAW_DEBUG: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  OPENCLAW_AGENT_CONTAINER_NAME: z.string().default("openclaw-jsyu-openclaw-1"),
  OPENCLAW_AGENT_DOCKER_USER: z.string().default("node"),
  OPENCLAW_AGENT_SESSION_DEFAULT: z.string().default("n8n-main"),
  OPENCLAW_AGENT_DEFAULT: z.string().optional(),
  OPENCLAW_WEBHOOK_AGENT: z.string().default("interpreter"),
  OPENCLAW_WEBHOOK_SESSION_ID: z.string().default("n8n-interpreter"),
  OPENCLAW_AGENT_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  DATA_PROVIDER: z.enum(["inmemory", "supabase"]).default("inmemory"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
