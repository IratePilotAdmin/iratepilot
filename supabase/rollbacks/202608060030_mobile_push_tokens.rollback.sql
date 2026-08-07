begin;

do $$
begin
  if to_regclass('public.mobile_push_tokens') is not null
    and exists (select 1 from public.mobile_push_tokens limit 1) then
    raise exception 'Refusing rollback: public.mobile_push_tokens contains data';
  end if;
end;
$$;

drop table if exists public.mobile_push_tokens;

commit;
