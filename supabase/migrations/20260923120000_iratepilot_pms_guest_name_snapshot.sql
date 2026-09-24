BEGIN;
-- Send the guest name needed by the hotel's front desk, and no other profile
-- data, with each future iRatePilot OTA reservation event.
CREATE OR REPLACE FUNCTION public.irp_pms_booking_payload(b public.bookings) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',b.id,'confirmation_code',b.confirmation_code,
 'customer_id',b.customer_id,'property_id',b.property_id,'room_id',b.room_id,
 'check_in',b.check_in::text,'check_out',b.check_out::text,'guests',b.guests,
 'subtotal',b.subtotal::text,'taxes',b.taxes::text,'fees',b.fees::text,'total',b.total::text,'status',b.status::text,
 'guest_name',(SELECT CASE WHEN length(btrim(p.full_name)) BETWEEN 1 AND 200 THEN btrim(p.full_name) END FROM public.profiles p WHERE p.id=b.customer_id))
$$;
REVOKE ALL ON FUNCTION public.irp_pms_booking_payload(public.bookings) FROM PUBLIC,anon,authenticated;
COMMIT;
