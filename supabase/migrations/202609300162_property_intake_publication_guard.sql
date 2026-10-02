-- Keep property publication aligned with the verified hotel-intake launch gate.

create or replace function public.get_verified_hotel_intake_property_ids(
  p_property_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property_ids uuid[];
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(
    pg_catalog.array_agg(distinct application.property_id),
    array[]::uuid[]
  )
  into v_property_ids
  from public.partner_application_review_evidence as review
  join public.partner_applications as application
    on application.id = review.application_id
  where application.property_id = any(coalesce(p_property_ids, array[]::uuid[]))
    and application.status = 'approved'
    and review.decision = 'approved'
    and review.legal_business_verified
    and review.representative_authority_verified
    and review.content_rights_verified
    and review.commercial_terms_acknowledgement_verified
    and review.inactive_draft_scope_confirmed;

  return v_property_ids;
end;
$$;

revoke all on function public.get_verified_hotel_intake_property_ids(uuid[])
  from public, anon, service_role;
grant execute on function public.get_verified_hotel_intake_property_ids(uuid[])
  to authenticated;

create or replace function public.set_property_publication_state(
  p_property_id uuid,
  p_active boolean
)
returns public.properties
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_agreement_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'A publication state is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-commercial-agreement:' || coalesce(p_property_id::text, ''),
      0
    )
  );

  if p_active then
    if not exists (
      select 1
      from public.partner_application_review_evidence as intake_review
      join public.partner_applications as application
        on application.id = intake_review.application_id
      where application.property_id = p_property_id
        and application.status = 'approved'
        and intake_review.decision = 'approved'
        and intake_review.legal_business_verified
        and intake_review.representative_authority_verified
        and intake_review.content_rights_verified
        and intake_review.commercial_terms_acknowledgement_verified
        and intake_review.inactive_draft_scope_confirmed
    ) then
      raise exception 'A verified approved hotel application linked to this property is required before publication'
        using errcode = 'P0001';
    end if;

    v_current_agreement_id :=
      public.current_hotel_commercial_agreement_evidence_id(p_property_id);
    if v_current_agreement_id is null
      or not exists (
        select 1
        from public.property_commercial_review_evidence as review
        join public.properties as property_record
          on property_record.id = review.property_id
        where property_record.id = p_property_id
          and review.commercial_agreement_evidence_id = v_current_agreement_id
          and review.id = (
            select latest_review.id
            from public.property_commercial_review_evidence as latest_review
            where latest_review.property_id = property_record.id
              and latest_review.commercial_agreement_evidence_id =
                v_current_agreement_id
            order by latest_review.created_at desc, latest_review.id desc
            limit 1
          )
          and review.commercial_terms_version =
            property_record.commercial_terms_version
          and lower(trim(review.support_contact_email)) =
            lower(trim(property_record.support_contact_email))
          and review.reviewer_id = property_record.commercial_verified_by
          and review.created_at = property_record.commercial_verified_at
          and review.legal_business_verified
          and review.sole_owner_conflict_acknowledged
          and review.commercial_terms_evidence_verified
          and review.support_contact_verified
      )
    then
      raise exception 'An effective executed hotel commercial agreement and matching commercial review are required before publication'
        using errcode = 'P0001';
    end if;
  end if;

  return public.set_property_publication_state_graph_guarded(
    p_property_id,
    p_active
  );
end;
$$;

revoke all on function public.set_property_publication_state(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_property_publication_state(uuid, boolean)
  to authenticated;
