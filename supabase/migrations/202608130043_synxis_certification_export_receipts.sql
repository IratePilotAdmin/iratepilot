begin;

create table if not exists public.synxis_certification_export_receipts (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (provider_id = 'sabre-synxis'),
  schema_version integer not null check (schema_version = 1),
  checksum text not null unique check (checksum ~ '^[a-f0-9]{64}$'),
  packet_generated_at timestamptz not null,
  evidence_event_count integer not null check (evidence_event_count >= 0),
  request_receipt_count integer not null check (request_receipt_count >= 0),
  exported_by uuid,
  exporter_name text not null check (char_length(exporter_name) between 1 and 200),
  exported_at timestamptz not null default clock_timestamp()
);

create index if not exists synxis_certification_export_receipts_exported_at_idx
  on public.synxis_certification_export_receipts (exported_at desc);

comment on table public.synxis_certification_export_receipts is
  'Immutable, non-secret issuance receipts for iRatePilot SynXis certification packets; packet bodies and credentials are prohibited.';

alter table public.synxis_certification_export_receipts enable row level security;
revoke all on table public.synxis_certification_export_receipts from public, anon, authenticated;

create or replace function public.prevent_synxis_certification_export_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'SynXis certification export receipts are immutable';
end;
$$;

revoke all on function public.prevent_synxis_certification_export_receipt_mutation()
  from public, anon, authenticated;

drop trigger if exists synxis_certification_export_receipt_immutable_trigger
  on public.synxis_certification_export_receipts;
create trigger synxis_certification_export_receipt_immutable_trigger
before update or delete on public.synxis_certification_export_receipts
for each row execute function public.prevent_synxis_certification_export_receipt_mutation();

commit;
