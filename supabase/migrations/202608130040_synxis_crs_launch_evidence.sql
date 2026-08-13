begin;

create table if not exists public.synxis_crs_launch_evidence (
  provider_id text primary key default 'sabre-synxis'
    check (provider_id = 'sabre-synxis'),
  vendor_approved boolean not null default false,
  certification_environment_approved boolean not null default false,
  property_mapped boolean not null default false,
  sandbox_validated boolean not null default false,
  production_smoke_validated boolean not null default false,
  live_enabled boolean not null default false,
  vendor_approval_reference text check (char_length(vendor_approval_reference) <= 500),
  approved_environment text check (char_length(approved_environment) <= 200),
  property_code text check (char_length(property_code) <= 200),
  support_contact text check (char_length(support_contact) <= 500),
  verification_notes text check (char_length(verification_notes) <= 4000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint synxis_certification_requires_vendor_approval check (
    not certification_environment_approved or vendor_approved
  ),
  constraint synxis_property_mapping_requires_certification check (
    not property_mapped or (vendor_approved and certification_environment_approved)
  ),
  constraint synxis_sandbox_requires_property_mapping check (
    not sandbox_validated or (vendor_approved and certification_environment_approved and property_mapped)
  ),
  constraint synxis_production_smoke_requires_sandbox check (
    not production_smoke_validated or sandbox_validated
  ),
  constraint synxis_live_requires_production_smoke check (
    not live_enabled or production_smoke_validated
  ),
  constraint synxis_live_requires_activation_details check (
    not live_enabled or (
      char_length(btrim(coalesce(vendor_approval_reference, ''))) > 1
      and char_length(btrim(coalesce(approved_environment, ''))) > 1
      and char_length(btrim(coalesce(property_code, ''))) > 1
      and char_length(btrim(coalesce(support_contact, ''))) > 1
    )
  )
);

comment on table public.synxis_crs_launch_evidence is
  'Admin-confirmed, non-secret evidence for Sabre SynXis CRS certification and production launch gates.';

alter table public.synxis_crs_launch_evidence enable row level security;
revoke all on table public.synxis_crs_launch_evidence from public, anon, authenticated;

commit;
