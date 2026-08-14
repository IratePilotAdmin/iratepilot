begin;

alter table public.synxis_certification_export_receipts
  drop constraint if exists synxis_certification_export_receipts_schema_version_check;

alter table public.synxis_certification_export_receipts
  add constraint synxis_certification_export_receipts_schema_version_check
  check (schema_version in (1, 2));

alter table public.synxis_certification_export_receipts
  add column if not exists receipt_binding_required boolean not null default false;

alter table public.synxis_certification_export_receipts
  add constraint synxis_certification_export_receipts_binding_check
  check ((schema_version = 2 and receipt_binding_required) or schema_version = 1);

comment on column public.synxis_certification_export_receipts.receipt_binding_required is
  'True when the packet embeds this immutable receipt ID and covers it with the packet checksum.';

commit;
