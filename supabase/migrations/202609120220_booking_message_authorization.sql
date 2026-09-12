begin;

-- Preserve the installed implementation and privileges; also accepts the
-- identical correction already applied to production on September 12.
do $migration$
declare
  definition text := pg_get_functiondef('public.send_booking_message(uuid,text)'::regprocedure);
  old_guard text := 'and not (auth.uid() = v_partner_owner and v_partner_status = ''approved'')';
  new_guard text := 'and (auth.uid() = v_partner_owner and v_partner_status = ''approved'') IS NOT TRUE';
  old_count integer;
  new_count integer;
begin
  old_count := (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard);
  new_count := (length(definition)-length(replace(definition,new_guard,'')))/length(new_guard);
  if old_count=1 and new_count=0 then
    execute replace(definition,old_guard,new_guard);
  elsif old_count<>0 or new_count<>1 then
    raise exception 'Booking message authorization source changed; review required';
  end if;
end $migration$;

commit;
