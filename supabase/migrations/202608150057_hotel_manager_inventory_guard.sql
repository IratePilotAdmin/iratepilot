begin;

create or replace function public.enforce_hotel_manager_inventory_room_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id
    and auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  then
    raise exception 'Hotel managers cannot transfer inventory between rooms'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hotel_manager_inventory_room_immutability()
  from public, anon, authenticated;
drop trigger if exists enforce_hotel_manager_inventory_room_immutability
  on public.inventory;
create trigger enforce_hotel_manager_inventory_room_immutability
before update of room_id on public.inventory
for each row execute function public.enforce_hotel_manager_inventory_room_immutability();

commit;
