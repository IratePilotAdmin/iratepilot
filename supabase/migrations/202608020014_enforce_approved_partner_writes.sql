begin;

drop policy if exists "Partners can update own properties" on public.properties;
create policy "Partners can update own properties"
  on public.properties for update
  using (exists (
    select 1 from public.partners
    where partners.id = properties.partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (
    active = false and exists (
      select 1 from public.partners
      where partners.id = properties.partner_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Partners can manage own rooms" on public.rooms;
create policy "Partners can manage own rooms"
  on public.rooms for all
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = rooms.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = rooms.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

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
  with check (exists (
    select 1
    from public.rooms
    join public.properties on properties.id = rooms.property_id
    join public.partners on partners.id = properties.partner_id
    where rooms.id = inventory.room_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

commit;
