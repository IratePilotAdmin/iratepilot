-- Isolated branch only: revenue-auth-20261001 / ybehrayzwzyufxbxcysq.
-- Verify native branch metadata independently before execution. No live PMS use.
-- The guarded API expires after 30 minutes. Run companion cleanup even on failure.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $$
BEGIN
 IF (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE id='00000000-0000-4000-8000-000000000002' AND name='Synthetic HTTP property')
 OR EXISTS(SELECT 1 FROM irp_pms.nightly_rates)
 OR EXISTS(SELECT 1 FROM irp_pms.reservations)
 OR EXISTS(SELECT 1 FROM irp_pms.rate_actions)
 OR EXISTS(SELECT 1 FROM irp_pms.activity)
 OR to_regclass('irp_pms.qualification_write_scope') IS NOT NULL
 OR has_function_privilege('authenticated','public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer)','execute')
 OR to_regprocedure('irp_pms.qualification_preflight_original(uuid,uuid,uuid,bigint,date,bigint,integer,integer)') IS NOT NULL
 OR has_function_privilege('authenticated','public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb)','execute')
 THEN RAISE EXCEPTION 'Isolated write fixture baseline differs'; END IF;
END $$;
CREATE TABLE irp_pms.qualification_write_scope(singleton boolean PRIMARY KEY CHECK(singleton),expires_at timestamptz NOT NULL,stay_date date NOT NULL);
ALTER TABLE irp_pms.qualification_write_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.qualification_write_scope FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO irp_pms.qualification_write_scope VALUES(true,clock_timestamp()+interval '30 minutes',(clock_timestamp() AT TIME ZONE 'America/Chicago')::date+1);
INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone)
VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','Synthetic audited HTTP property','USD','America/Chicago');
INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name)
VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000031','Synthetic audited HTTP rooms');
INSERT INTO irp_pms.rate_plans(tenant_id,property_id,id,room_type_id,name,tax_basis_points,active)
VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000031','Synthetic audited HTTP rate',0,true);
INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label,housekeeping)
SELECT '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000031','audited-http-'||n,'Clean' FROM generate_series(1,10)n;
INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units)
SELECT '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000031',stay_date,10 FROM irp_pms.qualification_write_scope;
INSERT INTO irp_pms.nightly_rates(tenant_id,property_id,plan_id,stay_date,amount_minor)
SELECT tenant_id,property_id,'00000000-0000-4000-8000-000000000032',stay_date,14000 FROM irp_pms.nightly_capacity WHERE property_id='00000000-0000-4000-8000-000000000030';
INSERT INTO irp_pms.reservations(tenant_id,property_id,room_type_id,status,arrival,departure,source,source_booking_id,source_version,payload_hash,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor)
SELECT tenant_id,property_id,room_type_id,'Confirmed',stay_date,stay_date+1,'direct','audited-http-'||n,1,repeat('a',64),1,14000,0,0,14000
FROM irp_pms.nightly_capacity CROSS JOIN generate_series(1,8)n WHERE property_id='00000000-0000-4000-8000-000000000030';

-- Preserve the actual candidate body and its disabled ACLs in a private schema.
ALTER FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) SET SCHEMA irp_pms;
ALTER FUNCTION irp_pms.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) RENAME TO qualification_apply_original;
CREATE FUNCTION public.irp_pms_pilot_apply_revenue_decision(
 p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_stay_date date,
 p_current_rate_minor bigint,p_recommended_rate_minor bigint,p_minimum_rate_minor bigint,p_maximum_rate_minor bigint,
 p_competitor_rate_minor bigint,p_event_uplift_basis_points integer,p_effective_units integer,p_reserved_units integer,
 p_occupancy_tenths_percent integer,p_adjustment_basis_points integer,p_guardrail text,p_explanations jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() NOT IN('7e3ac7b8-3286-4fcb-aaa9-a850390d787c'::uuid,'fe6502af-b9a2-478d-abad-bfbec8539df6'::uuid,'451c631e-2e3f-4293-b78c-e1bb92087f20'::uuid)
 OR p_tenant IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
 OR p_property IS DISTINCT FROM '00000000-0000-4000-8000-000000000030'::uuid
 OR p_plan IS DISTINCT FROM '00000000-0000-4000-8000-000000000032'::uuid
 OR p_request IS NULL OR p_request NOT IN('00000000-0000-4000-8000-000000000020'::uuid,'00000000-0000-4000-8000-000000000021'::uuid,'00000000-0000-4000-8000-000000000022'::uuid,'00000000-0000-4000-8000-000000000023'::uuid)
 OR NOT EXISTS(SELECT 1 FROM irp_pms.qualification_write_scope WHERE singleton AND expires_at>clock_timestamp() AND stay_date=p_stay_date)
 THEN RAISE EXCEPTION 'Isolated write qualification scope denied or expired' USING ERRCODE='42501'; END IF;
 RETURN irp_pms.qualification_apply_original(p_tenant,p_property,p_request,p_plan,p_expected_version,p_stay_date,p_current_rate_minor,p_recommended_rate_minor,p_minimum_rate_minor,p_maximum_rate_minor,p_competitor_rate_minor,p_event_uplift_basis_points,p_effective_units,p_reserved_units,p_occupancy_tenths_percent,p_adjustment_basis_points,p_guardrail,p_explanations);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) TO authenticated;

-- Authenticated PMS readback is limited to this expiring synthetic fixture.
-- The original preflight's disabled ACL is preserved in the private schema.
ALTER FUNCTION public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) SET SCHEMA irp_pms;
ALTER FUNCTION irp_pms.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) RENAME TO qualification_preflight_original;
CREATE FUNCTION public.irp_pms_pilot_revenue_facts_preflight(
 p_tenant uuid,p_property uuid,p_plan uuid,p_expected_version bigint,p_stay_date date,
 p_current_rate_minor bigint,p_effective_units integer,p_reserved_units integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() NOT IN('7e3ac7b8-3286-4fcb-aaa9-a850390d787c'::uuid,'fe6502af-b9a2-478d-abad-bfbec8539df6'::uuid,'451c631e-2e3f-4293-b78c-e1bb92087f20'::uuid)
 OR p_tenant IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
 OR p_property IS DISTINCT FROM '00000000-0000-4000-8000-000000000030'::uuid
 OR p_plan IS DISTINCT FROM '00000000-0000-4000-8000-000000000032'::uuid
 OR NOT EXISTS(SELECT 1 FROM irp_pms.qualification_write_scope WHERE singleton AND expires_at>clock_timestamp() AND stay_date=p_stay_date)
 THEN RAISE EXCEPTION 'Isolated readback scope denied or expired' USING ERRCODE='42501'; END IF;
 RETURN irp_pms.qualification_preflight_original(p_tenant,p_property,p_plan,p_expected_version,p_stay_date,p_current_rate_minor,p_effective_units,p_reserved_units);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) TO authenticated;

CREATE FUNCTION irp_pms.qualification_http_audit_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.property_id='00000000-0000-4000-8000-000000000030'::uuid AND NEW.request_id='00000000-0000-4000-8000-000000000022'::uuid
 THEN RAISE EXCEPTION 'Synthetic audited HTTP failure' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.qualification_http_audit_failure() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER qualification_http_audit_failure BEFORE INSERT ON irp_pms.revenue_rate_decisions FOR EACH ROW EXECUTE FUNCTION irp_pms.qualification_http_audit_failure();
NOTIFY pgrst,'reload schema';
COMMIT;
