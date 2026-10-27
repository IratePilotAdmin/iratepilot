begin;

create table public.inventory_supplier_validation_evidence (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null check (supplier_id = 'ratehawk'),
  environment text not null check (environment = 'sandbox'),
  validation_kind text not null check (validation_kind = 'hotel_search'),
  result text not null check (result = 'passed'),
  checkin date not null,
  checkout date not null,
  hotel_count integer not null check (hotel_count > 0),
  rate_count integer not null check (rate_count > 0),
  tested_by uuid references public.profiles(id) on delete set null,
  tested_at timestamptz not null,
  deployment_revision text,
  created_at timestamptz not null default now(),
  check (checkout > checkin),
  check (deployment_revision is null or length(deployment_revision) between 7 and 64)
);

comment on table public.inventory_supplier_validation_evidence is
  'Server-recorded, non-secret inventory supplier validation evidence. Never stores credentials or raw supplier responses.';

alter table public.inventory_supplier_validation_evidence enable row level security;

revoke all on table public.inventory_supplier_validation_evidence
  from public, anon, authenticated, service_role;
grant select, insert on table public.inventory_supplier_validation_evidence
  to service_role;

create index inventory_supplier_validation_evidence_supplier_tested_idx
  on public.inventory_supplier_validation_evidence (supplier_id, tested_at desc);

commit;
