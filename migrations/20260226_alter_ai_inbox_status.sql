alter table public.ai_inbox
  drop constraint if exists ai_inbox_status_check;

update public.ai_inbox
set status = case
  when status = 'done' then 'processed'
  when status = 'error' then 'failed'
  else status
end
where status in ('done', 'error');

alter table public.ai_inbox
  add constraint ai_inbox_status_check
  check (status in ('received', 'processed', 'failed'));

drop index if exists public.ai_inbox_unit_source_message_uidx;
create unique index if not exists ai_inbox_unit_message_uidx
  on public.ai_inbox (unit_id, message_id);
