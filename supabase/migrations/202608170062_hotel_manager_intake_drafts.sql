begin;

alter table public.partner_applications
  add column if not exists star_rating integer,
  add column if not exists contact_role text,
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists description text,
  add column if not exists amenities text[] not null default '{}',
  add column if not exists photo_source_url text,
  add column if not exists additional_notes text,
  add column if not exists hotel_authorized boolean not null default false,
  add column if not exists content_rights_confirmed boolean not null default false,
  add column if not exists information_accurate boolean not null default false,
  add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.partner_applications
  add constraint partner_applications_star_rating_check
    check (star_rating is null or star_rating in (4, 5)) not valid,
  add constraint partner_applications_contact_role_check
    check (
      contact_role is null or contact_role in (
        'hotel_owner',
        'general_manager',
        'revenue_manager',
        'sales_manager',
        'authorized_representative'
      )
    ) not valid,
  add constraint partner_applications_phone_length_check
    check (phone is null or char_length(phone) between 7 and 30) not valid,
  add constraint partner_applications_description_length_check
    check (description is null or char_length(description) between 120 and 4000) not valid,
  add constraint partner_applications_amenities_count_check
    check (cardinality(amenities) between 0 and 20) not valid,
  add constraint partner_applications_secure_urls_check
    check (
      (website_url is null or website_url ~ '^https://[^/@:]+([/:?#]|$)')
      and (photo_source_url is null or photo_source_url ~ '^https://[^/@:]+([/:?#]|$)')
    ) not valid;

drop index if exists public.one_pending_partner_application_per_email;
create unique index if not exists one_pending_partner_application_per_email_and_property
  on public.partner_applications (lower(trim(email)), lower(trim(property_name)))
  where status = 'pending';

create unique index if not exists partner_applications_property_id_key
  on public.partner_applications (property_id)
  where property_id is not null;

create or replace function public.review_partner_application(
  p_application_id uuid,
  p_status text
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
    if v_application.star_rating not in (4, 5)
      or v_application.contact_role is null
      or v_application.phone is null
      or v_application.website_url is null
      or v_application.address_line1 is null
      or v_application.city is null
      or v_application.postal_code is null
      or v_application.country is null
      or v_application.description is null
      or coalesce(cardinality(v_application.amenities), 0) = 0
      or v_application.photo_source_url is null
      or not v_application.hotel_authorized
      or not v_application.content_rights_confirmed
      or not v_application.information_accurate
    then
      raise exception 'Complete and verify the hotel intake before approval'
        using errcode = '22023';
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
    values (v_user_id, v_application.property_name, 'approved')
    on conflict (owner_id) do update
      set business_name = excluded.business_name,
          status = 'approved'
    returning id into v_partner_id;

    if v_application.property_id is null then
      v_slug_base := trim(both '-' from regexp_replace(
        lower(v_application.property_name),
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
        amenities,
        city,
        region,
        country,
        active
      ) values (
        v_partner_id,
        v_application.property_name,
        v_slug,
        v_application.property_type,
        v_application.star_rating,
        v_application.description,
        v_application.amenities,
        v_application.city,
        v_application.region,
        v_application.country,
        false
      ) returning id into v_property_id;

      update public.partner_applications
      set property_id = v_property_id
      where id = p_application_id;
    end if;
  end if;

  update public.partner_applications
  set status = p_status
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.review_partner_application(uuid, text)
  from public, anon, service_role;
grant execute on function public.review_partner_application(uuid, text) to authenticated;

commit;
