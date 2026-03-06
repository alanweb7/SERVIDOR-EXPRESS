import { z } from "zod";

export const adminAgentCreateSchema = z.object({
  agent: z.string().min(1),
  workspace: z.string().min(1).default("/data/.openclaw/workspace"),
  model: z.string().min(1).default("openai-codex/gpt-5.3-codex"),
  non_interactive: z.boolean().default(true)
});

export const adminAgentIdentitySchema = z.object({
  agent: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1).optional()
});

export const adminAgentBindSchema = z.object({
  agent: z.string().min(1),
  bind: z.string().min(1)
});

export const adminAgentTemplateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  channel: z.string().min(1).default("whatsapp"),
  persona: z.string().min(1),
  language: z.string().min(1).default("pt-BR"),
  system_prompt: z.string().min(1),
  welcome_message: z.string().min(1),
  menu_options: z.array(z.string().min(1)).default([]),
  fallback_message: z.string().min(1),
  transfer_to_human: z.boolean().default(true),
  active: z.boolean().default(true),
  workspace: z.string().min(1).default("/data/.openclaw/workspace"),
  model: z.string().min(1).default("openai-codex/gpt-5.3-codex")
});

export const adminPersistentAgentUpsertSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  persona: z.string().min(1),
  identity_name: z.string().min(1),
  identity_emoji: z.string().min(1).optional(),
  channel: z.string().min(1).default("whatsapp"),
  workspace: z.string().min(1).default("/data/.openclaw/workspace"),
  model: z.string().min(1).default("openai-codex/gpt-5.3-codex"),
  system_prompt: z.string().optional(),
  welcome_message: z.string().optional(),
  fallback_message: z.string().optional(),
  menu_options: z.array(z.string().min(1)).default([]),
  transfer_to_human: z.boolean().default(true),
  active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
  sync_openclaw: z.boolean().default(true)
});

export const adminPersistentAgentSyncSchema = z.object({
  slug: z.string().min(1),
  channel: z.string().min(1).optional(),
  workspace: z.string().min(1).optional(),
  model: z.string().min(1).optional()
});

export type AdminAgentCreateInput = z.infer<typeof adminAgentCreateSchema>;
export type AdminAgentIdentityInput = z.infer<typeof adminAgentIdentitySchema>;
export type AdminAgentBindInput = z.infer<typeof adminAgentBindSchema>;
export type AdminAgentTemplateInput = z.infer<typeof adminAgentTemplateSchema>;
export type AdminPersistentAgentUpsertInput = z.infer<typeof adminPersistentAgentUpsertSchema>;
export type AdminPersistentAgentSyncInput = z.infer<typeof adminPersistentAgentSyncSchema>;
