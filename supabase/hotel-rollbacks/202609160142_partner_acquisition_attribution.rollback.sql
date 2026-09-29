-- Restore the prior onboarding validator. Existing attribution remains stored but new attributed registrations pause until reapplied.

create or replace function public.validate_partner_onboarding_json(p_value jsonb, p_registration boolean, p_complete boolean default false)
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
