do $$
begin
  if to_regclass('public.synxis_certification_export_receipts') is not null
    and exists (
      select 1 from public.synxis_certification_export_receipts
      where schema_version = 2 or receipt_binding_required
    ) then
    raise exception 'Refusing rollback: SynXis schema-2 certification packet receipts exist';
  end if;
end;
$$;

alter table public.synxis_certification_export_receipts
  drop constraint if exists synxis_certification_export_receipts_binding_check;
alter table public.synxis_certification_export_receipts
  drop column if exists receipt_binding_required;
alter table public.synxis_certification_export_receipts
  drop constraint if exists synxis_certification_export_receipts_schema_version_check;
alter table public.synxis_certification_export_receipts
  add constraint synxis_certification_export_receipts_schema_version_check
  check (schema_version = 1);
