BEGIN;
-- Pause property creation/model changes. Keep guards and read-only reports;
-- removing whole-home guards would let older editors break unit exclusivity.
REVOKE ALL ON FUNCTION public.irp_pms_pilot_configure_operating_model(uuid,uuid,uuid,bigint,text,integer),public.irp_pms_pilot_create_property(uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
