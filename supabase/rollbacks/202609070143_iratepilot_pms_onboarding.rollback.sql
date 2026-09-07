BEGIN;
REVOKE EXECUTE ON FUNCTION irp_pms.onboard_hotel(uuid,uuid,text,text) FROM service_role;
-- Retain created organizations, memberships, properties and request receipts.
COMMIT;
