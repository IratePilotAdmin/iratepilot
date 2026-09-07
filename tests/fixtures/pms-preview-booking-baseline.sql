CREATE OR REPLACE FUNCTION public.enforce_approved_partner_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
 if not exists (
 select 1 from public.rooms
 join public.properties on properties.id = rooms.property_id
 join public.partners on partners.id = properties.partner_id
 where rooms.id = new.room_id and properties.id = new.property_id
 and rooms.active = true and properties.active = true and partners.status = 'approved'
 ) then
 raise exception 'Bookings require an active room from an approved partner' using errcode = '23514';
 end if;
 return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.record_booking_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
 if tg_op = 'INSERT' or new.status is distinct from old.status then
 insert into booking_status_history (booking_id, status, actor_id, note)
 values (new.id, new.status, auth.uid(), new.cancellation_reason);
 end if;
 return new;
end;
$function$;
CREATE TRIGGER enforce_approved_partner_booking BEFORE INSERT OR UPDATE OF property_id, room_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION enforce_approved_partner_booking();
CREATE TRIGGER on_booking_status_changed AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION record_booking_status();
ALTER TABLE bookings ADD COLUMN stripe_payment_mode text CONSTRAINT bookings_stripe_payment_mode_check CHECK(stripe_payment_mode IS NULL OR stripe_payment_mode IN ('test','live'));
