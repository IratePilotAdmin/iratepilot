begin;

create table if not exists public.property_pms_credentials (
  connection_id uuid primary key references public.property_pms_connections(id) on delete cascade,
  ciphertext text not null check (length(ciphertext) > 20),
  initialization_vector text not null check (length(initialization_vector) > 10),
  authentication_tag text not null check (length(authentication_tag) > 10),
  key_version integer not null default 1 check (key_version > 0),
  configured_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.property_pms_credentials is
  'AES-256-GCM encrypted PMS credentials. Accessible only through server-side service-role routes.';

alter table public.property_pms_credentials enable row level security;
revoke all on table public.property_pms_credentials from anon, authenticated;

create table if not exists public.pms_connection_test_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.property_pms_connections(id) on delete cascade,
  validation_mode text not null check (validation_mode in ('configuration_only', 'vendor_sandbox')),
  result text not null check (result in ('passed', 'failed')),
  detail_code text not null check (length(detail_code) between 1 and 80),
  tested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pms_connection_test_events enable row level security;
revoke all on table public.pms_connection_test_events from anon, authenticated;

commit;
