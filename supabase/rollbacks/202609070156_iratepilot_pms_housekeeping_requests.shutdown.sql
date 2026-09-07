BEGIN;
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_set_housekeeping(uuid,uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
-- Keep readiness/occupancy revision triggers and immutable request evidence.
-- Never restore the unsafe unversioned housekeeping entry point.
COMMIT;
