begin;

drop policy if exists "Partners can manage own inventory" on public.inventory;
create policy "Partners can manage own inventory"
  on public.inventory for all
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = inventory.room_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (
    inventory.stay_date >= current_date
    and exists (
      select 1
      from public.rooms
      join public.properties on properties.id = rooms.property_id
      join public.partners on partners.id = properties.partner_id
      where rooms.id = inventory.room_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

commit;
