begin;

create table if not exists public.priority_pms_launch_evidence (
  provider_id text primary key check (provider_id in (
    'oracle-opera',
    'hilton-pep',
    'hilton-onq',
    'marriott-fosse',
    'marriott-fs-pms',
    'hotelkey'
  )),
  vendor_approved boolean not null default false,
  property_mapped boolean not null default false,
  sandbox_validated boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not property_mapped or vendor_approved),
  check (not sandbox_validated or (vendor_approved and property_mapped))
);

comment on table public.priority_pms_launch_evidence is
  'Admin-confirmed non-secret evidence for priority PMS production launch gates.';

alter table public.priority_pms_launch_evidence enable row level security;
revoke all on table public.priority_pms_launch_evidence from anon, authenticated;

commit;
