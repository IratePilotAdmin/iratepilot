BEGIN;
-- Preserve immutable receipts and actor-only recovery while stopping new moves.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_move_room(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
