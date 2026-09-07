BEGIN;
-- Pause new import writes without deleting previews, receipts or reservations.
-- Staff can continue operating reservations that were already committed.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_stage_import(uuid,uuid,uuid,text,jsonb),public.irp_pms_pilot_commit_import(uuid,uuid,uuid,uuid),public.irp_pms_pilot_discard_import(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
