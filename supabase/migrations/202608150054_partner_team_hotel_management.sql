begin;

alter table public.partner_team_members
  add column if not exists can_manage_hotels boolean not null default false;

comment on column public.partner_team_members.can_manage_hotels is
  'Allows approved partner-team members to manage draft properties, rooms, rates, and future inventory. It never grants publication, billing, payout, invitation, or live-traffic controls.';

update public.partner_team_members
set can_manage_hotels = true,
    updated_at = now()
where status = 'active'
  and member_role in ('general_manager', 'revenue_manager', 'sales_manager');

create or replace function public.can_manage_partner_hotels(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.partners
    where partners.id = p_partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ) or exists (
    select 1
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.partner_id = p_partner_id
      and partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  );
$$;

create or replace function public.resolve_partner_hotel_access()
returns table (resolved_partner_id uuid, access_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.partner_id, candidate.access_role
  from (
    select partners.id as partner_id, 'owner'::text as access_role, 0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select partner_team_members.partner_id,
      partner_team_members.member_role as access_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_hotels
      and partner_team_members.member_role in (
        'general_manager', 'revenue_manager', 'sales_manager'
      )
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ) as candidate
  order by candidate.priority, candidate.partner_id
  limit 1;
$$;

revoke all on function public.can_manage_partner_hotels(uuid)
  from public, anon, service_role;
grant execute on function public.can_manage_partner_hotels(uuid) to authenticated;
revoke all on function public.resolve_partner_hotel_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_hotel_access() to authenticated;

drop policy if exists "Partners can view own properties" on public.properties;
drop policy if exists "Partner integration managers view properties" on public.properties;
drop policy if exists "Hotel managers view partner properties" on public.properties;
create policy "Hotel managers view partner properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_hotels(partner_id));

drop policy if exists "Partners can update own properties" on public.properties;
drop policy if exists "Hotel managers update partner properties" on public.properties;
create policy "Hotel managers update partner properties"
  on public.properties for update to authenticated
  using (public.can_manage_partner_hotels(partner_id))
  with check (
    active = false
    and public.can_manage_partner_hotels(partner_id)
  );

drop policy if exists "Partners can manage own rooms" on public.rooms;
drop policy if exists "Hotel managers view partner rooms" on public.rooms;
drop policy if exists "Hotel managers create partner rooms" on public.rooms;
drop policy if exists "Hotel managers update partner rooms" on public.rooms;
create policy "Hotel managers view partner rooms"
  on public.rooms for select to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers create partner rooms"
  on public.rooms for insert to authenticated
  with check (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers update partner rooms"
  on public.rooms for update to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ))
  with check (exists (
    select 1 from public.properties
    where properties.id = rooms.property_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));

drop policy if exists "Partners can manage own inventory" on public.inventory;
drop policy if exists "Hotel managers view partner inventory" on public.inventory;
drop policy if exists "Hotel managers create partner inventory" on public.inventory;
drop policy if exists "Hotel managers update partner inventory" on public.inventory;
create policy "Hotel managers view partner inventory"
  on public.inventory for select to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    where rooms.id = inventory.room_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ));
create policy "Hotel managers create partner inventory"
  on public.inventory for insert to authenticated
  with check (
    inventory.stay_date >= current_date
    and exists (
      select 1
      from public.rooms
      join public.properties on properties.id = rooms.property_id
      where rooms.id = inventory.room_id
        and public.can_manage_partner_hotels(properties.partner_id)
    )
  );
create policy "Hotel managers update partner inventory"
  on public.inventory for update to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    where rooms.id = inventory.room_id
      and public.can_manage_partner_hotels(properties.partner_id)
  ))
  with check (
    inventory.stay_date >= current_date
    and exists (
      select 1
      from public.rooms
      join public.properties on properties.id = rooms.property_id
      where rooms.id = inventory.room_id
        and public.can_manage_partner_hotels(properties.partner_id)
    )
  );

create or replace function public.enforce_hotel_manager_property_partner_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.partner_id is distinct from old.partner_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer properties between partners'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_property_partner_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_property_partner_immutability
  on public.properties;
create trigger enforce_hotel_manager_property_partner_immutability
before update of partner_id on public.properties
for each row execute function public.enforce_hotel_manager_property_partner_immutability();

create or replace function public.enforce_disabled_team_member_capabilities()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'disabled' then
    new.can_manage_integrations := false;
    new.can_manage_hotels := false;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_disabled_team_member_capabilities()
  from public, anon, authenticated;
drop trigger if exists enforce_disabled_team_member_capabilities
  on public.partner_team_members;
create trigger enforce_disabled_team_member_capabilities
before insert or update of status on public.partner_team_members
for each row execute function public.enforce_disabled_team_member_capabilities();

drop function if exists public.list_own_partner_team_members();
create function public.list_own_partner_team_members()
returns table (
  member_id uuid,
  member_email text,
  member_role text,
  member_status text,
  can_manage_integrations boolean,
  can_manage_hotels boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    partner_team_members.id,
    lower(coalesce(auth.users.email, '')),
    partner_team_members.member_role,
    partner_team_members.status,
    partner_team_members.can_manage_integrations,
    partner_team_members.can_manage_hotels,
    partner_team_members.updated_at
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  join auth.users on auth.users.id = partner_team_members.user_id
  where partners.owner_id = auth.uid()
    and partners.status = 'approved'
  order by partner_team_members.updated_at desc, partner_team_members.id;
$$;

revoke all on function public.list_own_partner_team_members()
  from public, anon, service_role;
grant execute on function public.list_own_partner_team_members() to authenticated;

create or replace function public.disable_own_partner_team_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_members.partner_id
  into v_partner_id
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  where partner_team_members.id = p_member_id
    and partner_team_members.status = 'active'
    and (
      partner_team_members.can_manage_integrations
      or partner_team_members.can_manage_hotels
    )
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_members;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_members
  set status = 'disabled',
      can_manage_integrations = false,
      can_manage_hotels = false,
      updated_at = now()
  where id = p_member_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, member_id, actor_id
  ) values (
    v_partner_id, 'member_disabled', p_member_id, auth.uid()
  );
  return true;
end;
$$;

revoke all on function public.disable_own_partner_team_member(uuid)
  from public, anon, service_role;
grant execute on function public.disable_own_partner_team_member(uuid) to authenticated;

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select invitation.*
  into v_invitation
  from public.partner_team_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations as invitation
    set status = 'expired', updated_at = now()
    where invitation.id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners as partner
    where partner.id = v_invitation.partner_id and partner.status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles as profile
  set role = 'partner'::public.user_role
  where profile.id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, can_manage_hotels, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, true, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      can_manage_hotels = true,
      updated_at = now();

  update public.partner_team_invitations as invitation
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where invitation.id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;

comment on table public.partner_team_access_events is
  'Immutable owner/admin audit events for partner team-access revocation.';

commit;
