-- Targeted175 save pause. All follow-up records/history remain in place.
-- Detail, queue, original-actor receipt status and durable retirement stay enabled.
-- Existing financial, reservation and other operating APIs are unchanged.
BEGIN;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_balance_follow_up(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
