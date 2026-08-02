begin;

create or replace function public.return_room_property_to_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.properties
  set active = false
  where id = new.property_id;

  if tg_op = 'UPDATE' and old.property_id is distinct from new.property_id then
    update public.properties
    set active = false
    where id = old.property_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_room_type_changed on public.rooms;
create trigger on_room_type_changed
  after insert or update of property_id, name, max_guests, base_rate, active
  on public.rooms
  for each row execute procedure public.return_room_property_to_review();

revoke all on function public.return_room_property_to_review()
  from public, anon, authenticated;

commit;
