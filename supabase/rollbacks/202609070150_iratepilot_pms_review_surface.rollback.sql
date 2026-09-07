BEGIN;
-- Stop the new public surface without deleting receipt/audit history or
-- removing the room-type uniqueness guard. The private145 shutdown remains
-- available when all authenticated reprocessing must stop.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_review_events(uuid,uuid),public.irp_pms_pilot_reprocess(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
