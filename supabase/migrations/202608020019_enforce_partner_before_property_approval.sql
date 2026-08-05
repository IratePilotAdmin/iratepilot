begin;

update public.properties
set active = false
where active = true
  and not exists (
    select 1
    from public.partners
    where partners.id = properties.partner_id
      and partners.status = 'approved'
  );

create or replace function public.enforce_partner_before_property_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active = true and not exists (
    select 1
    from public.partners
    where partners.id = new.partner_id
      and partners.status = 'approved'
  ) then
    raise exception 'Approve the partner account before activating the property'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_partner_before_property_activation() from public;

drop trigger if exists enforce_partner_before_property_activation on public.properties;
create trigger enforce_partner_before_property_activation
before insert or update of active, partner_id on public.properties
for each row execute function public.enforce_partner_before_property_activation();

commit;
