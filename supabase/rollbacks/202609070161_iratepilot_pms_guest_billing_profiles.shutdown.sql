BEGIN;
-- Stop contact/profile mutations while retaining scoped reads and existing
-- stay snapshots. No guest data, receipts or financial records are deleted.
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_guest_profile(uuid,uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_save_reservation_guest(uuid,uuid,uuid,uuid,bigint,uuid,bigint,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
