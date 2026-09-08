BEGIN;
-- Disable these read endpoints without changing financial or operating data.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_folio_activity_report(uuid,uuid,date,date),public.irp_pms_pilot_current_balances(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
