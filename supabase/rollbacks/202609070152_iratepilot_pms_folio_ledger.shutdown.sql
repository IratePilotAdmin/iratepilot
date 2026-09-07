BEGIN;
-- Preserve all historical ledger entries and opening snapshots; stop new posts.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_post_folio(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
