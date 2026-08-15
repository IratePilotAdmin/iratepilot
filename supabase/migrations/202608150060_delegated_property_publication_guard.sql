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

  if public.can_manage_partner_hotels(old.partner_id) then
    if old.active then
      raise exception 'Hotel managers may edit only properties that are already inactive'
        using errcode = '42501';
    end if;

    if new.active is distinct from old.active then
      raise exception 'Hotel managers cannot change property publication state'
        using errcode = '42501';
    end if;

    if (
      to_jsonb(new) - 'description' - 'image_url' - 'amenities'
    ) is distinct from (
      to_jsonb(old) - 'description' - 'image_url' - 'amenities'
    ) then
      raise exception 'Hotel managers may update only approved draft property content fields'
        using errcode = '42501';
    end if;
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

commit;
