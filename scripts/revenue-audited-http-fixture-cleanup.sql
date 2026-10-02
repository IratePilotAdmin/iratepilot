-- Same isolated branch only; run after qualification success, failure or expiry.
-- Do not delete accounts or the original read-only HTTP receipt fixture.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE id='00000000-0000-4000-8000-000000000030' AND name='Synthetic audited HTTP property')
 OR to_regclass('irp_pms.qualification_write_scope') IS NULL
 THEN RAISE EXCEPTION 'Isolated cleanup scope differs'; END IF;
END $$;
DROP FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb);
ALTER FUNCTION irp_pms.qualification_apply_original(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) RENAME TO irp_pms_pilot_apply_revenue_decision;
ALTER FUNCTION irp_pms.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) SET SCHEMA public;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER qualification_http_audit_failure ON irp_pms.revenue_rate_decisions;
DROP FUNCTION irp_pms.qualification_http_audit_failure();
DROP TABLE irp_pms.qualification_write_scope;
DELETE FROM irp_pms.revenue_rate_decisions WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.rate_actions WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.activity WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.reservations WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.nightly_rates WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.nightly_capacity WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.rooms WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.rate_plans WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.room_types WHERE property_id='00000000-0000-4000-8000-000000000030';
DELETE FROM irp_pms.properties WHERE id='00000000-0000-4000-8000-000000000030';
NOTIFY pgrst,'reload schema';
COMMIT;
