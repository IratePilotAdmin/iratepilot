BEGIN;
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_save_rate_plan(uuid,uuid,uuid,uuid,bigint,uuid,text,integer,boolean),public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint),public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) FROM authenticated,service_role;
-- Retain configured prices, quote snapshots, accepted-booking receipts and reads.
COMMIT;
