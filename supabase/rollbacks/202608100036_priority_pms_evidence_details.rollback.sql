begin;

do $$
begin
  if exists (
    select 1 from public.priority_pms_launch_evidence
    where nullif(trim(vendor_approval_reference), '') is not null
      or nullif(trim(approved_environment), '') is not null
      or nullif(trim(property_code), '') is not null
      or nullif(trim(support_contact), '') is not null
      or nullif(trim(verification_notes), '') is not null
  ) then
    raise exception 'Refusing rollback: priority PMS activation evidence details exist';
  end if;
end $$;

alter table public.priority_pms_launch_evidence
  drop constraint if exists priority_pms_launch_evidence_details_length,
  drop column if exists verification_notes,
  drop column if exists support_contact,
  drop column if exists property_code,
  drop column if exists approved_environment,
  drop column if exists vendor_approval_reference;

commit;
