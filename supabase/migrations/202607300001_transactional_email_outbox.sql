begin;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  subject text not null,
  template_name text not null,
  template_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  resend_email_id text,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_processing_idx
  on public.email_outbox (status, scheduled_at);

alter table public.email_outbox enable row level security;

revoke all on public.email_outbox from anon, authenticated;
grant all on public.email_outbox to service_role;

commit;
