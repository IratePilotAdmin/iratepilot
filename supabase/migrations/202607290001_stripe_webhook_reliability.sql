begin;

create table if not exists public.stripe_financial_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  object_id text,
  booking_financial_id uuid references public.booking_financials(id) on delete set null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing','processed','ignored','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The preceding financial-reconciliation migration creates this table with
-- fewer columns. CREATE TABLE IF NOT EXISTS does not upgrade that definition.
alter table public.stripe_financial_events
  add column if not exists attempt_count integer not null default 1,
  add column if not exists received_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.stripe_financial_events
  set received_at = coalesce(received_at, created_at),
      updated_at = coalesce(updated_at, created_at)
  where received_at is null or updated_at is null;

alter table public.stripe_financial_events
  alter column received_at set default now(),
  alter column received_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column processing_status set default 'processing';

alter table public.stripe_financial_events
  drop constraint if exists stripe_financial_events_processing_status_check;
alter table public.stripe_financial_events
  add constraint stripe_financial_events_processing_status_check
    check (processing_status in ('processing','processed','ignored','failed'));

create index if not exists stripe_financial_events_status_idx
  on public.stripe_financial_events(processing_status, received_at desc);

create index if not exists stripe_financial_events_object_idx
  on public.stripe_financial_events(object_id)
  where object_id is not null;

alter table public.stripe_financial_events enable row level security;

commit;
