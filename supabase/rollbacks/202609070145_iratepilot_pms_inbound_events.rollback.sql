BEGIN;
REVOKE EXECUTE ON FUNCTION irp_pms.receive_reservation(uuid,uuid,text,text,bigint,text,jsonb,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION irp_pms.reprocess_reservation(uuid,uuid,text,uuid,text) FROM authenticated;
-- Retain inbound receipts and reservation records. No automatic replay or deletion.
COMMIT;
