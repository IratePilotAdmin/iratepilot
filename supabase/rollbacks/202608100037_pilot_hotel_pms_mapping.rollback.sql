do $$
begin
  if exists (
    select 1 from public.property_pms_connections
    where hotel_authorized
       or nullif(trim(room_type_mapping), '') is not null
       or nullif(trim(rate_plan_mapping), '') is not null
       or nullif(trim(tax_fee_mapping), '') is not null
       or nullif(trim(cancellation_policy_mapping), '') is not null
  ) then
    raise exception 'Refusing rollback: pilot-hotel PMS authorization or mapping data exists';
  end if;
end $$;

begin;

alter table public.property_pms_connections
  drop constraint if exists property_pms_connections_mapping_length,
  drop column if exists cancellation_policy_mapping,
  drop column if exists tax_fee_mapping,
  drop column if exists rate_plan_mapping,
  drop column if exists room_type_mapping,
  drop column if exists hotel_authorized;

commit;

