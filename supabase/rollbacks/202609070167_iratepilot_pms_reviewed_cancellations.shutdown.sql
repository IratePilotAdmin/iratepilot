BEGIN;
-- Keep read/recovery and the disabled legacy cancellation branch. Restoring
-- the old branch would reintroduce cancellation without reviewed versions.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_reservation(uuid,uuid,uuid,uuid,bigint,date,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
