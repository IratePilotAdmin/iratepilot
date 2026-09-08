BEGIN;
-- Preserve disposition/receipt reads and financial report labels.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_mark_no_show(uuid,uuid,uuid,uuid,bigint,date,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
