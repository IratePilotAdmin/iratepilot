begin;

create table if not exists public.stripe_financial_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique,
  event_type text not null,
  object_id text,
  booking_financial_id uuid references public.booking_financials(id) on delete set null,
  processing_status text not null default 'processed'
    check (processing_status in ('processed', 'ignored', 'failed')),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stripe_financial_events_financial_idx
  on public.stripe_financial_events(booking_financial_id, created_at desc);

create index if not exists stripe_financial_events_object_idx
  on public.stripe_financial_events(object_id);

alter table public.stripe_financial_events enable row level security;

commit;
