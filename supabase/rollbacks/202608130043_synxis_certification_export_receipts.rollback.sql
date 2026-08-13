do $$
begin
  if to_regclass('public.synxis_certification_export_receipts') is not null
    and exists (select 1 from public.synxis_certification_export_receipts) then
    raise exception 'Refusing rollback: SynXis certification export receipts exist';
  end if;
end;
$$;

drop trigger if exists synxis_certification_export_receipt_immutable_trigger
  on public.synxis_certification_export_receipts;
drop function if exists public.prevent_synxis_certification_export_receipt_mutation();
drop table if exists public.synxis_certification_export_receipts;
