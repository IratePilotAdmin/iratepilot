begin;

create table public.expedia_b2c_site_review_receipts (
  id uuid primary key default gen_random_uuid(),
  requirement_code text not null check (requirement_code ~ '^(GR|SP|AP|BP|CP|ER|TR)[0-9]+[a-z]?$'),
  decision text not null check (decision in ('verified', 'not_applicable', 'pending')),
  evidence_reference text check (evidence_reference is null or length(evidence_reference) between 3 and 500),
  verification_notes text check (verification_notes is null or length(verification_notes) between 3 and 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  deployment_revision text,
  created_at timestamptz not null default now(),
  check (deployment_revision is null or length(deployment_revision) between 7 and 64),
  check (
    (decision = 'verified' and evidence_reference is not null)
    or (decision in ('not_applicable', 'pending') and verification_notes is not null)
  )
);

comment on table public.expedia_b2c_site_review_receipts is
  'Append-only, sanitized review receipts for Expedia Rapid B2C launch requirements. Receipts contain references and reviewer notes, never credentials or raw supplier payloads.';

alter table public.expedia_b2c_site_review_receipts enable row level security;

revoke all on table public.expedia_b2c_site_review_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.expedia_b2c_site_review_receipts
  to service_role;

create index expedia_b2c_site_review_receipts_requirement_idx
  on public.expedia_b2c_site_review_receipts (requirement_code, reviewed_at desc, id desc);

commit;
