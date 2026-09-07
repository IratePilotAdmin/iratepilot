BEGIN;
-- Fail-closed access shutdown; preserve all hotel data for reconciliation.
REVOKE ALL ON SCHEMA irp_pms FROM authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA irp_pms FROM authenticated,service_role;
REVOKE EXECUTE ON FUNCTION irp_pms.is_member(uuid) FROM authenticated,service_role;
COMMIT;
