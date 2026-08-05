begin;

do $$
begin
  if to_regclass('public.booking_messages') is not null
    and exists (select 1 from public.booking_messages limit 1) then
    raise exception 'Refusing rollback: public.booking_messages contains data';
  end if;
end;
$$;

drop function if exists public.send_booking_message(uuid, text);
drop table if exists public.booking_messages;

commit;
