begin;

-- Keep the completeness check and all availability writes in one transaction.
-- SECURITY INVOKER retains the caller's inventory RLS and the existing hold
-- and published-commercial-terms triggers.
create function public.set_partner_inventory_availability(
  p_room_id uuid,
  p_start_date date,
  p_end_date date,
  p_available_units integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_locked integer;
  v_updated integer;
begin
  if auth.uid() is null
    or p_room_id is null
    or p_start_date is null
    or p_end_date is null
    or p_start_date < current_date
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 365
    or p_available_units is null
    or p_available_units < 0
    or p_available_units > 500 then
    raise exception 'Invalid availability change' using errcode = '22023';
  end if;

  v_expected := p_end_date - p_start_date + 1;
  select count(*) into v_locked
  from (
    select inventory.id
    from public.inventory as inventory
    where inventory.room_id = p_room_id
      and inventory.stay_date between p_start_date and p_end_date
    for update
  ) as locked_dates;

  if v_locked <> v_expected then
    raise exception 'One or more dates have no saved inventory' using errcode = 'P0001';
  end if;

  update public.inventory as inventory
  set available_units = p_available_units
  where inventory.room_id = p_room_id
    and inventory.stay_date between p_start_date and p_end_date;
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Availability changed during update' using errcode = 'P0001';
  end if;
  return v_updated;
end;
$$;

revoke all on function public.set_partner_inventory_availability(uuid,date,date,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.set_partner_inventory_availability(uuid,date,date,integer)
  to authenticated;

commit;
