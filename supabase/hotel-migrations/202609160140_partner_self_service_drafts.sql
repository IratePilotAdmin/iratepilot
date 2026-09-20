begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Private applicant workspace only. This migration does not promote roles,
-- create properties, execute agreements, approve applications, or enable sales.
do $dependencies$
declare v_column text;
begin
  if to_regprocedure('public.submit_partner_application(text,text,smallint,text,text,text,text,text,public.property_type,text,text,text,text,text,text,text,text[],text,boolean,boolean,boolean,text,boolean,timestamp with time zone)') is null
    or to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception 'Partner drafts require the canonical commercial intake and account schema';
  end if;
  foreach v_column in array array['id','email','property_name','status','country','photo_source_url','hotel_authorized',
    'commercial_terms_version_acknowledged','commercial_terms_acknowledged_at']
  loop
    if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.partner_applications'::regclass
      and attname = v_column and attnum > 0 and not attisdropped) then
      raise exception 'Partner drafts require application column %', v_column;
    end if;
  end loop;
end;
$dependencies$;

create table public.partner_onboarding_controls (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.partner_onboarding_controls (singleton, enabled) values (true, false);
alter table public.partner_onboarding_controls enable row level security;
revoke all on public.partner_onboarding_controls from public, anon, authenticated, service_role;
grant select, update on public.partner_onboarding_controls to service_role;

create table public.partner_onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  registration_key uuid not null,
  registration jsonb not null check (jsonb_typeof(registration) = 'object' and octet_length(registration::text) <= 4000),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 16000),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  application_id uuid unique references public.partner_applications(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (owner_id, registration_key),
  check ((status = 'draft' and application_id is null and submitted_at is null)
    or (status = 'submitted' and application_id is not null and submitted_at is not null))
);
alter table public.partner_onboarding_drafts enable row level security;
revoke all on public.partner_onboarding_drafts from public, anon, authenticated, service_role;
grant select on public.partner_onboarding_drafts to authenticated;
create policy partner_onboarding_owner_read on public.partner_onboarding_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy partner_onboarding_admin_read on public.partner_onboarding_drafts
  for select to authenticated using (exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  ));

create function public.partner_onboarding_verified_owner()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if not exists (select 1 from public.partner_onboarding_controls where singleton and enabled) then
    raise exception 'Partner self-service onboarding is not enabled' using errcode = '55000';
  end if;
  perform 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = v_owner and u.email_confirmed_at is not null and length(trim(u.email)) > 0
    for share of u;
  if v_owner is null or not found then
    raise exception 'A verified account email is required' using errcode = '42501';
  end if;
  return v_owner;
end;
$$;

create function public.validate_partner_onboarding_json(p_value jsonb, p_registration boolean, p_complete boolean default false)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_key text; v_value jsonb; v_text text; v_max integer;
  v_registration_keys text[] := array['propertyName','firstName','lastName','phone','countryCode','region','propertyType','roomCount','continueOnboarding'];
  v_detail_keys text[] := array['legalBusinessName','starRating','contactRole','websiteUrl','addressLine1','city','postalCode','description','amenities','primaryImageUrl','supportContactEmail','representativeAuthorityConfirmed','contentRightsConfirmed','informationAccurate','commercialTermsAcknowledged'];
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or octet_length(p_value::text) > (case when p_registration then 4000 else 16000 end) then
    raise exception 'Invalid onboarding document' using errcode = '22023';
  end if;
  for v_key, v_value in select * from jsonb_each(p_value)
  loop
    if not (v_key = any(case when p_registration then v_registration_keys else v_detail_keys end)) then
      raise exception 'Unexpected onboarding field: %', v_key using errcode = '22023';
    end if;
    if v_key in ('continueOnboarding','representativeAuthorityConfirmed','contentRightsConfirmed','informationAccurate','commercialTermsAcknowledged') then
      if jsonb_typeof(v_value) <> 'boolean' then raise exception 'Invalid acknowledgement' using errcode = '22023'; end if;
    elsif v_key in ('roomCount','starRating') then
      if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]{1,5}$' then
        raise exception 'Invalid numeric onboarding field' using errcode = '22023';
      end if;
      if (v_key = 'roomCount' and (v_value::text)::integer not between 1 and 10000)
        or (v_key = 'starRating' and (v_value::text)::integer not in (4,5)) then
        raise exception 'Unsupported hotel eligibility value' using errcode = '22023';
      end if;
    elsif v_key = 'amenities' then
      if jsonb_typeof(v_value) <> 'array' then raise exception 'Invalid amenities' using errcode = '22023'; end if;
      if jsonb_array_length(v_value) > 20 or exists (
        select 1 from jsonb_array_elements(v_value) item
        where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 80
          or (p_complete and length(trim(item #>> '{}')) < 2)
          or (item #>> '{}') ~ '[[:cntrl:]]'
      ) then raise exception 'Invalid amenities' using errcode = '22023'; end if;
    else
      if jsonb_typeof(v_value) <> 'string' then raise exception 'Invalid text onboarding field' using errcode = '22023'; end if;
      v_text := case when p_complete then trim(v_value #>> '{}') else v_value #>> '{}' end;
      v_max := case when v_key = 'description' then 4000 when v_key in ('websiteUrl','primaryImageUrl') then 2000
        when v_key = 'supportContactEmail' then 254 when v_key in ('propertyName','legalBusinessName','addressLine1') then 200
        when v_key = 'phone' then 30 when v_key = 'postalCode' then 20 else 100 end;
      if length(v_text) > v_max or (v_key <> 'description' and v_text ~ '[[:cntrl:]]') then
        raise exception 'Onboarding text exceeds allowed bounds' using errcode = '22023';
      end if;
      if p_complete and v_key in ('websiteUrl','primaryImageUrl') and v_text <> '' and (
        v_text !~* '^https://(\[[0-9a-f:.]+\]|[^:/?#@[:space:]]+)(:[0-9]{1,5})?([/?#].*)?$'
        or v_text ~ '[[:space:][:cntrl:]]' or position(chr(92) in v_text) > 0
      ) then raise exception 'An HTTPS URL without credentials is required' using errcode = '22023'; end if;
      if p_complete and v_key = 'supportContactEmail' and v_text <> '' and v_text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception 'Invalid support email' using errcode = '22023';
      end if;
      if v_key = 'contactRole' and v_text not in ('owner','authorized_representative','general_manager','revenue_manager','sales_manager') then
        raise exception 'Invalid representative role' using errcode = '22023';
      end if;
    end if;
  end loop;
  if p_registration then
    if not p_value ?& v_registration_keys
      or length(trim(p_value->>'propertyName')) not between 2 and 160
      or length(trim(p_value->>'firstName')) not between 2 and 50
      or length(trim(p_value->>'lastName')) not between 2 and 50
      or length(trim(p_value->>'phone')) not between 7 and 30
      or p_value->>'countryCode' !~ '^[A-Z]{2}$'
      or p_value->>'propertyType' not in ('hotel','resort','vacation_home')
      or p_value->'continueOnboarding' <> 'true'::jsonb then
      raise exception 'Complete the required registration fields' using errcode = '22023';
    end if;
  elsif p_complete then
    if not p_value ?& v_detail_keys
      or length(trim(p_value->>'legalBusinessName')) not between 2 and 200
      or length(trim(p_value->>'addressLine1')) not between 3 and 200
      or length(trim(p_value->>'city')) not between 2 and 100
      or length(trim(p_value->>'postalCode')) not between 2 and 20
      or length(trim(p_value->>'description')) not between 120 and 4000
      or length(trim(p_value->>'contactRole')) = 0
      or length(trim(p_value->>'websiteUrl')) = 0
      or length(trim(p_value->>'primaryImageUrl')) = 0
      or length(trim(p_value->>'supportContactEmail')) = 0
      or jsonb_array_length(p_value->'amenities') < 1
      or p_value->'representativeAuthorityConfirmed' <> 'true'::jsonb
      or p_value->'contentRightsConfirmed' <> 'true'::jsonb
      or p_value->'informationAccurate' <> 'true'::jsonb
      or p_value->'commercialTermsAcknowledged' <> 'true'::jsonb then
      raise exception 'Complete the required property details and acknowledgements' using errcode = '22023';
    end if;
  end if;
end;
$$;

create function public.partner_onboarding_draft_result(p_row public.partner_onboarding_drafts)
returns jsonb language sql immutable set search_path = '' as $$
  select to_jsonb(p_row) - 'owner_id';
$$;

create function public.create_partner_onboarding_draft(p_registration_key uuid, p_registration jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_row public.partner_onboarding_drafts;
begin
  v_owner := public.partner_onboarding_verified_owner();
  if p_registration_key is null then raise exception 'Registration key is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-onboarding:' || v_owner::text, 0));
  select * into v_row from public.partner_onboarding_drafts where owner_id = v_owner and registration_key = p_registration_key;
  if found then return public.partner_onboarding_draft_result(v_row); end if;
  perform public.validate_partner_onboarding_json(p_registration, true);
  if (select count(*) from public.partner_onboarding_drafts where owner_id = v_owner) >= 10 then
    raise exception 'Maximum saved hotel registrations reached' using errcode = '54000';
  end if;
  insert into public.partner_onboarding_drafts (owner_id, registration_key, registration)
  values (v_owner, p_registration_key, p_registration) returning * into v_row;
  return public.partner_onboarding_draft_result(v_row);
end;
$$;

create function public.save_partner_onboarding_draft(p_draft_id uuid, p_expected_revision integer, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_row public.partner_onboarding_drafts;
begin
  v_owner := public.partner_onboarding_verified_owner();
  select * into v_row from public.partner_onboarding_drafts where id = p_draft_id and owner_id = v_owner for update;
  if not found then raise exception 'Draft not found or not authorized' using errcode = '42501'; end if;
  if v_row.status <> 'draft' then raise exception 'Submitted drafts cannot be edited' using errcode = '55000'; end if;
  if v_row.revision is distinct from p_expected_revision then raise exception 'Draft revision changed; reload before saving' using errcode = '40001'; end if;
  perform public.validate_partner_onboarding_json(p_details, false);
  update public.partner_onboarding_drafts set details = p_details, revision = revision + 1, updated_at = now()
  where id = v_row.id returning * into v_row;
  return public.partner_onboarding_draft_result(v_row);
end;
$$;

create function public.submit_partner_onboarding_draft(p_draft_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid; v_row public.partner_onboarding_drafts; v_email text;
  v_response jsonb; v_application public.partner_applications;
begin
  v_owner := public.partner_onboarding_verified_owner();
  perform pg_advisory_xact_lock(hashtextextended('partner-onboarding:' || v_owner::text, 0));
  select * into v_row from public.partner_onboarding_drafts where id = p_draft_id and owner_id = v_owner for update;
  if not found then raise exception 'Draft not found or not authorized' using errcode = '42501'; end if;
  if v_row.status = 'submitted' then return public.partner_onboarding_draft_result(v_row); end if;
  if v_row.revision is distinct from p_expected_revision then raise exception 'Draft revision changed; reload before submitting' using errcode = '40001'; end if;
  perform public.validate_partner_onboarding_json(v_row.registration, true);
  perform public.validate_partner_onboarding_json(v_row.details, false, true);
  select lower(trim(email)) into v_email from auth.users where id = v_owner;
  v_response := public.submit_partner_application(
    trim(v_row.details->>'legalBusinessName'), trim(v_row.registration->>'propertyName'),
    (v_row.details->>'starRating')::smallint,
    trim(v_row.registration->>'firstName') || ' ' || trim(v_row.registration->>'lastName'),
    v_row.details->>'contactRole', v_email, trim(v_row.registration->>'phone'),
    trim(v_row.details->>'supportContactEmail'), (v_row.registration->>'propertyType')::public.property_type,
    trim(v_row.details->>'websiteUrl'), trim(v_row.details->>'addressLine1'), trim(v_row.details->>'city'),
    trim(v_row.registration->>'region'), trim(v_row.details->>'postalCode'), v_row.registration->>'countryCode',
    trim(v_row.details->>'description'), array(select trim(jsonb_array_elements_text(v_row.details->'amenities'))),
    trim(v_row.details->>'primaryImageUrl'), true, true, true,
    'hotel_partner_fee_disclosure_13_3_2026-08-22_v1', true, now()
  );
  select * into v_application from public.partner_applications
  where lower(trim(email)) = v_email and lower(trim(property_name)) = lower(trim(v_row.registration->>'propertyName'))
    and status = 'pending' for update;
  if v_application.id is null then raise exception 'Application could not be linked' using errcode = '55000'; end if;
  if exists (select 1 from public.partner_onboarding_drafts where application_id = v_application.id and id <> v_row.id) then
    raise exception 'This property already has a submitted onboarding draft' using errcode = '23505';
  end if;
  if v_response->'duplicate' = 'true'::jsonb and row(
    v_application.legal_business_name, v_application.star_rating, v_application.contact_name,
    v_application.contact_role, v_application.phone, v_application.support_contact_email,
    v_application.property_type, v_application.website_url, v_application.address_line1,
    v_application.city, v_application.region, v_application.postal_code, v_application.country_code,
    v_application.description, v_application.amenities, v_application.primary_image_url,
    v_application.representative_authority_confirmed, v_application.content_rights_confirmed,
    v_application.information_accurate, v_application.commercial_terms_acknowledged,
    v_application.commercial_terms_version_acknowledged
  ) is distinct from row(
    trim(v_row.details->>'legalBusinessName'), (v_row.details->>'starRating')::smallint,
    trim(v_row.registration->>'firstName') || ' ' || trim(v_row.registration->>'lastName'),
    v_row.details->>'contactRole', trim(v_row.registration->>'phone'), lower(trim(v_row.details->>'supportContactEmail')),
    (v_row.registration->>'propertyType')::public.property_type, trim(v_row.details->>'websiteUrl'), trim(v_row.details->>'addressLine1'),
    trim(v_row.details->>'city'), nullif(trim(v_row.registration->>'region'), ''), trim(v_row.details->>'postalCode'), v_row.registration->>'countryCode',
    trim(v_row.details->>'description'), array(select trim(jsonb_array_elements_text(v_row.details->'amenities'))), trim(v_row.details->>'primaryImageUrl'),
    true, true, true, true, 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'::text
  ) then
    raise exception 'A different pending application already exists; contact support before linking' using errcode = '23505';
  end if;
  -- Compatibility aliases for the existing admin queue, only for a new row.
  -- Never overwrite a pre-existing application returned by canonical deduplication.
  if v_response->'duplicate' = 'false'::jsonb then
    update public.partner_applications set country = v_row.registration->>'countryCode',
      photo_source_url = trim(v_row.details->>'primaryImageUrl'), hotel_authorized = true
    where id = v_application.id;
  end if;
  update public.partner_onboarding_drafts set status = 'submitted', application_id = v_application.id,
    revision = revision + 1, submitted_at = now(), updated_at = now()
  where id = v_row.id returning * into v_row;
  return public.partner_onboarding_draft_result(v_row);
end;
$$;

revoke all on function public.partner_onboarding_verified_owner() from public, anon, authenticated, service_role;
revoke all on function public.validate_partner_onboarding_json(jsonb, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.partner_onboarding_draft_result(public.partner_onboarding_drafts) from public, anon, authenticated, service_role;
revoke all on function public.create_partner_onboarding_draft(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.save_partner_onboarding_draft(uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.submit_partner_onboarding_draft(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.create_partner_onboarding_draft(uuid, jsonb) to authenticated;
grant execute on function public.save_partner_onboarding_draft(uuid, integer, jsonb) to authenticated;
grant execute on function public.submit_partner_onboarding_draft(uuid, integer) to authenticated;

comment on table public.partner_onboarding_drafts is
  'Private hotel applicant drafts; submission links the existing pending application queue. Commercial acknowledgement is disclosure only, not executed agreement evidence.';
commit;
