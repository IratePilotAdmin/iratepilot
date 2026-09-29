begin;

-- Non-destructive safety rollback. Retain submitted intake data and immutable
-- review evidence, retain the commercial control columns for application
-- compatibility, and disable new approvals. Existing properties remain subject
-- to the quarantine/publication guard; no commercial authority is inferred.
create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text,
  p_legal_business_verified boolean,
  p_representative_authority_verified boolean,
  p_content_rights_verified boolean,
  p_commercial_terms_acknowledgement_verified boolean,
  p_review_notes text
)
returns public.partner_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.partner_applications;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'declined') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if p_status = 'approved' then
    raise exception 'Commercial hotel approval is disabled by the migration 070 safety rollback'
      using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_review_notes, ''))) not between 3 and 2000 then
    raise exception 'Record a review note between 3 and 2,000 characters'
      using errcode = '22023';
  end if;

  select *
  into v_application
  from public.partner_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Partner application not found' using errcode = 'P0002';
  end if;
  if v_application.status = 'approved' then
    raise exception 'Approved partner access must be managed separately'
      using errcode = 'P0001';
  end if;

  insert into public.partner_application_review_evidence (
    application_id,
    reviewer_id,
    decision,
    legal_business_verified,
    representative_authority_verified,
    content_rights_verified,
    commercial_terms_acknowledgement_verified,
    evidence_summary
  ) values (
    p_application_id,
    auth.uid(),
    p_status,
    p_legal_business_verified,
    p_representative_authority_verified,
    p_content_rights_verified,
    p_commercial_terms_acknowledgement_verified,
    trim(p_review_notes)
  );

  update public.partner_applications
  set status = p_status
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) to authenticated;

comment on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) is 'Migration 070 safety rollback: retains additive intake and review evidence, permits pending/declined review records, and blocks every new approval.';

create or replace function public.record_property_commercial_review(
  p_property_id uuid,
  p_commercial_terms_version text,
  p_support_contact_email text,
  p_legal_business_verified boolean,
  p_sole_owner_conflict_acknowledged boolean,
  p_commercial_terms_evidence_verified boolean,
  p_support_contact_verified boolean,
  p_review_notes text
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  raise exception 'Commercial property verification is disabled by the migration 070 safety rollback'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.record_property_commercial_review(
  uuid, text, text, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.record_property_commercial_review(
  uuid, text, text, boolean, boolean, boolean, boolean, text
) to authenticated;

update public.properties
set active = false
where listing_scope = 'commercial' and active = true;

create or replace function public.set_property_publication_state(
  p_property_id uuid,
  p_active boolean
)
returns public.properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property public.properties;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_active then
    raise exception 'Commercial property publication is disabled by the migration 070 safety rollback'
      using errcode = 'P0001';
  end if;
  update public.properties
  set active = false
  where id = p_property_id
  returning * into v_property;
  if not found then
    raise exception 'Property not found' using errcode = 'P0002';
  end if;
  return v_property;
end;
$$;

revoke all on function public.set_property_publication_state(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_property_publication_state(uuid, boolean)
  to authenticated;

commit;
