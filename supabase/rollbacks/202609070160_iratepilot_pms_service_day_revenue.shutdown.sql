BEGIN;
-- Stop new allocation approvals and service closes, retaining immutable
-- reports, financial reconciliation flags and every guest folio unchanged.
REVOKE ALL ON FUNCTION public.irp_pms_pilot_start_service_ledger(uuid,uuid,uuid,date,text),public.irp_pms_pilot_approve_service_allocation(uuid,uuid,uuid,uuid,bigint,text,jsonb,text),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
