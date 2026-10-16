begin;

create table if not exists public.pms_webhook_event_receipts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.property_pms_connections(id) on delete cascade,
  provider_id text not null check (provider_id = 'apaleo'),
  provider_event_id text not null check (length(btrim(provider_event_id)) between 1 and 120),
  topic text not null check (topic ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  event_type text not null check (event_type ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  property_code text not null check (length(btrim(property_code)) between 1 and 120),
  provider_occurred_at timestamptz not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  tracking_id_sha256 text check (
    tracking_id_sha256 is null or tracking_id_sha256 ~ '^[0-9a-f]{64}$'
  ),
  received_at timestamptz not null default now(),
  unique (connection_id, provider_event_id)
);

create index if not exists pms_webhook_event_receipts_ordering_idx
  on public.pms_webhook_event_receipts (connection_id, provider_occurred_at, received_at);

comment on table public.pms_webhook_event_receipts is
  'Service-role-only digest receipts for authenticated PMS webhook events. Raw provider payloads and endpoint tokens are never stored.';

alter table public.pms_webhook_event_receipts enable row level security;
alter table public.pms_webhook_event_receipts force row level security;
revoke all on table public.pms_webhook_event_receipts from anon, authenticated;

commit;
