begin;

create unique index if not exists partners_owner_id_key
  on public.partners (owner_id);

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
          status = 'approved';
  end if;

  update public.partner_applications
  set status = p_status
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.review_partner_application(uuid, text) from public;
grant execute on function public.review_partner_application(uuid, text) to authenticated;

commit;
