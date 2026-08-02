begin;

create or replace function public.is_approved_marketplace_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = p_property_id
      and properties.active = true
      and partners.status = 'approved'
  );
$$;

create or replace function public.is_approved_marketplace_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = p_room_id
      and rooms.active = true
      and properties.active = true
      and partners.status = 'approved'
  );
$$;

revoke all on function public.is_approved_marketplace_property(uuid) from public;
revoke all on function public.is_approved_marketplace_room(uuid) from public;
grant execute on function public.is_approved_marketplace_property(uuid) to anon, authenticated;
grant execute on function public.is_approved_marketplace_room(uuid) to anon, authenticated;

drop policy if exists "Public can view active properties" on public.properties;
create policy "Public can view active properties"
  on public.properties for select
  using (
    active = true
    and public.is_approved_marketplace_property(id)
  );

drop policy if exists "Public can view active rooms" on public.rooms;
create policy "Public can view active rooms"
  on public.rooms for select
  using (
    active = true
    and public.is_approved_marketplace_property(property_id)
  );

drop policy if exists "Public can view inventory" on public.inventory;
create policy "Public can view inventory"
  on public.inventory for select
  using (public.is_approved_marketplace_room(room_id));

create or replace function public.enforce_approved_partner_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = new.room_id
      and properties.id = new.property_id
      and rooms.active = true
      and properties.active = true
      and partners.status = 'approved'
  ) then
    raise exception 'Bookings require an active room from an approved partner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_approved_partner_booking() from public;

drop trigger if exists enforce_approved_partner_booking on public.bookings;
create trigger enforce_approved_partner_booking
before insert or update of property_id, room_id on public.bookings
for each row execute function public.enforce_approved_partner_booking();

commit;
