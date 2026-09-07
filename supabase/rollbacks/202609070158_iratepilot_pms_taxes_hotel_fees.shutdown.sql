BEGIN;
-- Stop rate changes and quote conversion while retaining historical itemized
-- evidence, folio reads/postings, fee-safe amendments and ordinary operations.
-- Do not restore older amount formulas or remove populated snapshot columns.
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_rate_plan_v2(uuid,uuid,uuid,uuid,bigint,uuid,text,jsonb,boolean),public.irp_pms_pilot_save_rate_plan(uuid,uuid,uuid,uuid,bigint,uuid,text,integer,boolean),public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint),public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
