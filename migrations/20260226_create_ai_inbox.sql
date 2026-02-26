create table if not exists public.ai_inbox (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  source text not null,
  message_id text not null,
  conversation_id uuid not null,
  sender_name text not null,
  text text not null default '',
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempts integer not null default 0,
  output_message_id uuid null,
  error text null,
  created_at timestamptz not null default now(),
  processed_at timestamptz null
);

create unique index if not exists ai_inbox_unit_message_uidx
  on public.ai_inbox (unit_id, message_id);

create index if not exists ai_inbox_status_created_idx
  on public.ai_inbox (status, created_at desc);
