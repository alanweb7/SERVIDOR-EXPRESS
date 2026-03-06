create extension if not exists pgcrypto;

create table if not exists public.openclaw_agents_registry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  persona text not null,
  identity_name text not null,
  identity_emoji text,
  workspace text not null default '/data/.openclaw/workspace',
  model text not null default 'openai-codex/gpt-5.3-codex',
  channel text not null default 'whatsapp',
  system_prompt text,
  welcome_message text,
  fallback_message text,
  menu_options jsonb not null default '[]'::jsonb,
  transfer_to_human boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index if not exists idx_openclaw_agents_registry_active
  on public.openclaw_agents_registry (active);

create index if not exists idx_openclaw_agents_registry_channel
  on public.openclaw_agents_registry (channel);
