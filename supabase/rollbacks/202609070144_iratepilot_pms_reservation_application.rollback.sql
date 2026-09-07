BEGIN;
REVOKE EXECUTE ON FUNCTION irp_pms.apply_reservation(uuid,uuid,jsonb) FROM service_role;
-- Keep direct reservation writes revoked; retain reservation and capacity data.
COMMIT;
