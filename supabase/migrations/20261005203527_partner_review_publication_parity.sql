-- Complete the intake-review evidence shape before the later publication guard
-- can reference it. Older approved rows remain ineligible until re-reviewed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

alter table public.partner_application_review_evidence
  add column if not exists inactive_draft_scope_confirmed boolean not null default false;
-- Remove the legacy two-argument approval path so internal evidence cannot be
-- bypassed. Approval creates only an inactive, quarantined property draft.
drop function if exists public.review_partner_application(uuid, text);
create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text,
  p_legal_business_verified boolean,
  p_representative_authority_verified boolean,
  p_content_rights_verified boolean,
  p_commercial_terms_acknowledgement_verified boolean,
  p_inactive_draft_scope_confirmed boolean,
  p_review_notes text
)
returns public.partner_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.partner_applications;
  v_user_id uuid;
  v_partner_id uuid;
  v_property_id uuid;
  v_slug_base text;
  v_slug text;
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
  if v_application.status = 'approved' and p_status <> 'approved' then
    raise exception 'Approved partner access must be managed separately'
      using errcode = 'P0001';
  end if;

  if p_status = 'approved' then
    if v_application.legal_business_name is null
      or v_application.star_rating not in (4, 5)
      or v_application.contact_role is null
      or v_application.phone is null
      or v_application.support_contact_email is null
      or v_application.website_url is null
      or v_application.address_line1 is null
      or v_application.city is null
      or v_application.postal_code is null
      or v_application.country_code is null
      or v_application.description is null
      or coalesce(cardinality(v_application.amenities), 0) = 0
      or v_application.primary_image_url is null
      or not v_application.representative_authority_confirmed
      or not v_application.content_rights_confirmed
      or not v_application.information_accurate
      or not v_application.commercial_terms_acknowledged
      or v_application.commercial_terms_version_acknowledged is distinct from
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      or v_application.commercial_terms_acknowledged_at is null
    then
      raise exception 'Complete and verify the commercial hotel intake before approval'
        using errcode = 'P0001';
    end if;

    if not p_legal_business_verified
      or not p_representative_authority_verified
      or not p_content_rights_verified
      or not p_commercial_terms_acknowledgement_verified
      or not p_inactive_draft_scope_confirmed
      or length(trim(p_review_notes)) < 20
    then
      raise exception 'Record all internal review evidence before approval'
        using errcode = 'P0001';
    end if;

    select id
    into v_user_id
    from auth.users
    where lower(email) = lower(v_application.email)
    order by created_at
    limit 1;

    if v_user_id is null then
      raise exception 'Applicant must register with the application email before approval'
        using errcode = 'P0002';
    end if;
    update public.profiles
    set role = case when role = 'admin' then role else 'partner'::public.user_role end
    where id = v_user_id;

    if not found then
      raise exception 'The registered applicant profile could not be found'
        using errcode = 'P0002';
    end if;

    insert into public.partners (owner_id, business_name, status)
    values (v_user_id, v_application.legal_business_name, 'approved')
    on conflict (owner_id) do update
      set business_name = excluded.business_name,
          status = 'approved'
    returning id into v_partner_id;

    if v_application.property_id is null then
      v_slug_base := trim(both '-' from regexp_replace(
        lower(trim(v_application.property_name)),
        '[^a-z0-9]+',
        '-',
        'g'
      ));
      if v_slug_base = '' then
        v_slug_base := 'hotel';
      end if;
      v_slug := v_slug_base;
      if exists (select 1 from public.properties where slug = v_slug) then
        v_slug := v_slug_base || '-' || substring(v_application.id::text, 1, 8);
      end if;

      insert into public.properties (
        partner_id,
        name,
        slug,
        type,
        star_rating,
        description,
        image_url,
        amenities,
        city,
        region,
        country,
        active,
        listing_scope,
        direct_request_mode,
        support_contact_email
      ) values (
        v_partner_id,
        v_application.property_name,
        v_slug,
        v_application.property_type,
        v_application.star_rating,
        v_application.description,
        v_application.primary_image_url,
        v_application.amenities,
        v_application.city,
        v_application.region,
        v_application.country_code,
        false,
        'legacy_quarantined',
        'disabled',
        v_application.support_contact_email
      ) returning id into v_property_id;

      update public.partner_applications
      set property_id = v_property_id
      where id = p_application_id;
    end if;
  end if;

  insert into public.partner_application_review_evidence (
    application_id,
    reviewer_id,
    decision,
    legal_business_verified,
    representative_authority_verified,
    content_rights_verified,
    commercial_terms_acknowledgement_verified,
    inactive_draft_scope_confirmed,
    evidence_summary
  ) values (
    p_application_id,
    auth.uid(),
    p_status,
    p_legal_business_verified,
    p_representative_authority_verified,
    p_content_rights_verified,
    p_commercial_terms_acknowledgement_verified,
    p_inactive_draft_scope_confirmed,
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
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) from public, anon, service_role;
grant execute on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) to authenticated;

comment on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, boolean, text
) is 'Records internal commercial-intake review evidence and creates only an inactive, legacy-quarantined draft; does not authorize publication, provider traffic, reservations, payments, payouts, or Production.';

-- The previous seven-argument action cannot record the evidence required by
-- publication. Disable it after installing the eight-argument replacement.
revoke all on function public.review_partner_application(
  uuid, text, boolean, boolean, boolean, boolean, text
) from public, anon, authenticated, service_role;

commit;
