BEGIN;
-- Fail closed rather than restore the earlier revocation race. Historical
-- data and the separate reviewed cancellation API remain available.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_stay_action(uuid,uuid,uuid,text,uuid),public.irp_pms_pilot_set_housekeeping(uuid,uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
