begin;

drop policy if exists "Partner owners delete own rooms" on public.rooms;
create policy "Partner owners delete own rooms"
  on public.rooms for delete to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = rooms.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partner owners delete own inventory" on public.inventory;
create policy "Partner owners delete own inventory"
  on public.inventory for delete to authenticated
  using (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = inventory.room_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

commit;
