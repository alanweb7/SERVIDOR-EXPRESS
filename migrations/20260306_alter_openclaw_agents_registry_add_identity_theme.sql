alter table if exists public.openclaw_agents_registry
  add column if not exists identity_theme text;
