do $$
begin
  if to_regclass('public.synxis_crs_evidence_audit') is not null
    and exists (select 1 from public.synxis_crs_evidence_audit) then
    raise exception 'Refusing rollback: SynXis CRS evidence audit history exists';
  end if;
end;
$$;

drop trigger if exists synxis_crs_evidence_audit_trigger
  on public.synxis_crs_launch_evidence;
drop function if exists public.record_synxis_crs_evidence_audit();
drop trigger if exists synxis_crs_evidence_audit_immutable_trigger
  on public.synxis_crs_evidence_audit;
drop function if exists public.prevent_synxis_crs_evidence_audit_mutation();
drop table if exists public.synxis_crs_evidence_audit;
