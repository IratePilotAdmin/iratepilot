-- Disable only new document preparation. Keep every source record and existing
-- guest, folio, deposit, reservation and operational API unchanged.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
