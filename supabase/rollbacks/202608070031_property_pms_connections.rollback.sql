begin;

do $$
begin
  if to_regclass('public.property_pms_connections') is not null
    and exists (select 1 from public.property_pms_connections limit 1) then
    raise exception 'Refusing rollback: public.property_pms_connections contains data';
  end if;
end;
$$;

drop table if exists public.property_pms_connections;

commit;
