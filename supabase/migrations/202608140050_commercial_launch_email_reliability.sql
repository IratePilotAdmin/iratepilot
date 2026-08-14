begin;

alter table public.email_outbox
  drop constraint if exists email_outbox_status_check;
alter table public.email_outbox
  add constraint email_outbox_status_check
  check (status in ('pending','processing','sent','failed','suppressed','dead_letter'));
alter table public.email_outbox
  add column if not exists delivery_status text
    check (delivery_status is null or delivery_status in ('sent','delivered','delayed','bounced','complained','failed','suppressed')),
  add column if not exists delivery_event_at timestamptz,
  add column if not exists delivery_detail text;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  webhook_event_id text not null unique,
  resend_email_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'processing'
    check (processing_status in ('processing','processed','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  occurred_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_delivery_events_message_idx
  on public.email_delivery_events (resend_email_id, occurred_at desc);

create table if not exists public.email_suppressions (
  recipient_email text primary key check (recipient_email = lower(trim(recipient_email))),
  reason text not null check (reason in ('bounce','complaint','suppressed','manual')),
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_delivery_events enable row level security;
alter table public.email_suppressions enable row level security;
revoke all on public.email_delivery_events, public.email_suppressions from anon, authenticated;
grant all on public.email_delivery_events, public.email_suppressions to service_role;

create or replace function public.claim_transactional_email_job()
returns setof public.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.email_outbox
  where scheduled_at <= now()
    and attempts < 5
    and (
      status in ('pending', 'failed')
      or (status = 'processing' and updated_at < now() - interval '15 minutes')
    )
  order by scheduled_at, created_at
  for update skip locked
  limit 1;

  if v_job_id is null then return; end if;

  return query
  update public.email_outbox
  set status = 'processing', attempts = attempts + 1,
      last_error = null, updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_transactional_email_job() from public;
grant execute on function public.claim_transactional_email_job() to service_role;

commit;
