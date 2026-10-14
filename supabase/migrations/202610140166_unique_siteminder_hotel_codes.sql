begin;

do $$
begin
  if exists (
    select 1
    from public.property_pms_connections
    where provider_id = 'siteminder'
    group by external_property_code
    having count(*) > 1
  ) then
    raise exception 'Duplicate SiteMinder HotelCode values must be resolved before migration 166';
  end if;
end;
$$;

create unique index if not exists property_pms_connections_siteminder_hotel_code_unique
  on public.property_pms_connections (external_property_code)
  where provider_id = 'siteminder';

comment on index public.property_pms_connections_siteminder_hotel_code_unique is
  'Ensures an inbound SiteMinder HotelCode resolves to exactly one iRatePilot property.';

commit;
