do $$
begin
  if to_regclass('public.synxis_crs_launch_evidence') is not null
    and exists (
      select 1
        from public.synxis_crs_launch_evidence
       where vendor_approved
          or certification_environment_approved
          or property_mapped
          or sandbox_validated
          or production_smoke_validated
          or live_enabled
          or nullif(btrim(vendor_approval_reference), '') is not null
          or nullif(btrim(approved_environment), '') is not null
          or nullif(btrim(property_code), '') is not null
          or nullif(btrim(support_contact), '') is not null
          or nullif(btrim(verification_notes), '') is not null
    ) then
    raise exception 'Refusing rollback: SynXis CRS launch evidence exists';
  end if;
end;
$$;

drop table if exists public.synxis_crs_launch_evidence;
