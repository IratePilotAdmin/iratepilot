begin;

do $$
begin
  if exists (select 1 from public.property_pms_credentials limit 1) then
    raise exception 'Refusing rollback: property_pms_credentials contains data';
  end if;
end $$;

drop table if exists public.pms_connection_test_events;
drop table if exists public.property_pms_credentials;

commit;
