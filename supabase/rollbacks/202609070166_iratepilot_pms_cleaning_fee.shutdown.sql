BEGIN;
-- Stop new configuration/quotes/bookings without restoring older quote code,
-- which would omit configured Cleaning. Retain read/recovery and all history.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_save_property_fees(uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
