-- ISOLATED ONLY: match the read-only observed live dependency ACL.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification') OR (SELECT count(*) FROM irp_pms.properties)<>1 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint) TO authenticated,service_role;
