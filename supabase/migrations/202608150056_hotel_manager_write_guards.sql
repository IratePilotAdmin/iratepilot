begin;

create or replace function public.enforce_delegated_hotel_manager_property_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.partners
      where partners.id = old.partner_id
        and partners.owner_id = auth.uid()
    )
  then
    return new;
  end if;

  if public.can_manage_partner_hotels(old.partner_id)
    and (
      to_jsonb(new) - 'description' - 'image_url' - 'amenities' - 'active'
    ) is distinct from (
      to_jsonb(old) - 'description' - 'image_url' - 'amenities' - 'active'
    )
  then
    raise exception 'Hotel managers may update only approved draft property content fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_delegated_hotel_manager_property_fields()
  from public, anon, authenticated;
drop trigger if exists enforce_delegated_hotel_manager_property_fields
  on public.properties;
create trigger enforce_delegated_hotel_manager_property_fields
before update on public.properties
for each row execute function public.enforce_delegated_hotel_manager_property_fields();

create or replace function public.enforce_hotel_manager_room_property_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.property_id is distinct from old.property_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer rooms between properties'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_room_property_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_room_property_immutability
  on public.rooms;
create trigger enforce_hotel_manager_room_property_immutability
before update of property_id on public.rooms
for each row execute function public.enforce_hotel_manager_room_property_immutability();

commit;
