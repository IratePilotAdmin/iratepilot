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

create index if not exists stripe_financial_events_status_idx
  on public.stripe_financial_events(processing_status, received_at desc);

create index if not exists stripe_financial_events_object_idx
  on public.stripe_financial_events(object_id)
  where object_id is not null;

alter table public.stripe_financial_events enable row level security;

commit;
