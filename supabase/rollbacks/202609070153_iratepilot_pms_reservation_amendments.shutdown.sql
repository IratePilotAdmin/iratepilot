BEGIN;
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_amend_reservation(uuid,uuid,uuid,uuid,bigint,text,uuid,date,date,integer,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
