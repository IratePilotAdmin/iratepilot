-- Read-only release verification: never claims a job or sends a message.
do $verify$
declare
  message_source text;
begin
  if not (select relrowsecurity from pg_class where oid='public.booking_messages'::regclass) then
    raise exception 'Booking message row security must be enabled';
  end if;
  if exists (
    select 1 from (values ('anon'),('authenticated')) as browser(role_name)
    where has_table_privilege(role_name,'public.booking_messages','INSERT,UPDATE,DELETE,TRUNCATE')
       or has_any_column_privilege(role_name,'public.booking_messages','INSERT,UPDATE')
  ) then
    raise exception 'Booking message direct browser writes must be denied';
  end if;
  if has_function_privilege('anon','public.claim_transactional_email_job()','EXECUTE')
     or has_function_privilege('authenticated','public.claim_transactional_email_job()','EXECUTE')
     or not has_function_privilege('service_role','public.claim_transactional_email_job()','EXECUTE') then
    raise exception 'Email claim must be server-only';
  end if;
  select prosrc into strict message_source from pg_proc
    where oid='public.send_booking_message(uuid,text)'::regprocedure;
  if position('and (auth.uid() = v_partner_owner and v_partner_status = ''approved'') IS NOT TRUE' in message_source)=0
     or position('and not (auth.uid() = v_partner_owner' in message_source)>0 then
    raise exception 'Booking message NULL authorization correction missing';
  end if;
  if not has_function_privilege('authenticated','public.send_booking_message(uuid,text)','EXECUTE') then
    raise exception 'Authenticated booking message access missing';
  end if;
end $verify$;
