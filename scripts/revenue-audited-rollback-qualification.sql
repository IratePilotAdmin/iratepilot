-- Run ONLY on the independently verified non-default, with_data=false branch
-- revenue-auth-20261001 (ybehrayzwzyufxbxcysq), never on the PMS parent.
-- Native PostgreSQL transaction qualification; identities below are simulated
-- request claims, NOT Auth-issued HTTP sessions. No API execution grant changes.
-- All fixture writes, injected failures and temporary helpers roll back.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE revenue_qualification_results(case_name text PRIMARY KEY, passed boolean NOT NULL);

DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE id='00000000-0000-4000-8000-000000000002' AND name='Synthetic HTTP property')
 OR NOT EXISTS(SELECT 1 FROM irp_pms.rate_plans WHERE id='00000000-0000-4000-8000-000000000004' AND version=1 AND active)
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR (SELECT count(*) FROM irp_pms.revenue_rate_decisions)<>1
 OR EXISTS(SELECT 1 FROM irp_pms.rooms)
 OR EXISTS(SELECT 1 FROM irp_pms.nightly_capacity)
 OR EXISTS(SELECT 1 FROM irp_pms.nightly_rates)
 OR EXISTS(SELECT 1 FROM irp_pms.reservations)
 OR EXISTS(SELECT 1 FROM irp_pms.rate_actions)
 OR EXISTS(SELECT 1 FROM irp_pms.activity)
 THEN RAISE EXCEPTION 'Isolated fixture baseline differs; stop qualification'; END IF;
END $$;

CREATE FUNCTION pg_temp.qualification_apply(p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a jsonb:=jsonb_build_object(
 'tenant','00000000-0000-4000-8000-000000000001',
 'property','00000000-0000-4000-8000-000000000002',
 'request','00000000-0000-4000-8000-000000000020',
 'plan','00000000-0000-4000-8000-000000000004',
 'version',1,'day',((clock_timestamp() AT TIME ZONE 'America/Chicago')::date+1)::text,
 'current',14000,'recommended',16100,'minimum',7000,'maximum',21000,
 'event',0,'capacity',10,'reserved',8,'occupancy',800,'adjustment',1500,
 'guardrail','none','notes',jsonb_build_array('Rollback-only audited qualification'))||p_patch;
BEGIN
 RETURN public.irp_pms_pilot_apply_revenue_decision(
  (a->>'tenant')::uuid,(a->>'property')::uuid,(a->>'request')::uuid,(a->>'plan')::uuid,
  (a->>'version')::bigint,(a->>'day')::date,(a->>'current')::bigint,
  (a->>'recommended')::bigint,(a->>'minimum')::bigint,(a->>'maximum')::bigint,
  NULL,(a->>'event')::integer,(a->>'capacity')::integer,(a->>'reserved')::integer,
  (a->>'occupancy')::integer,(a->>'adjustment')::integer,a->>'guardrail',a->'notes');
END $$;

CREATE FUNCTION pg_temp.qualification_reject(p_case text,p_code text,p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_code text;
BEGIN
 BEGIN
  PERFORM pg_temp.qualification_apply(p_patch);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_code=RETURNED_SQLSTATE;
 END;
 IF actual_code IS DISTINCT FROM p_code THEN
  RAISE EXCEPTION 'Qualification case % expected %, received %',p_case,p_code,coalesce(actual_code,'success');
 END IF;
 INSERT INTO revenue_qualification_results VALUES(p_case,true);
END $$;

INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label,housekeeping)
SELECT '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
 '00000000-0000-4000-8000-000000000003','rollback-'||n::text,'Clean' FROM generate_series(1,10)n;
INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units)
VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
 '00000000-0000-4000-8000-000000000003',(clock_timestamp() AT TIME ZONE 'America/Chicago')::date+1,10);
INSERT INTO irp_pms.nightly_rates(tenant_id,property_id,plan_id,stay_date,amount_minor)
SELECT tenant_id,property_id,'00000000-0000-4000-8000-000000000004',stay_date,14000 FROM irp_pms.nightly_capacity;
INSERT INTO irp_pms.reservations(tenant_id,property_id,room_type_id,status,arrival,departure,
 source,source_booking_id,source_version,payload_hash,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor)
SELECT tenant_id,property_id,room_type_id,'Confirmed',stay_date,stay_date+1,'direct','rollback-'||n::text,
 1,repeat('a',64),1,14000,0,0,14000 FROM irp_pms.nightly_capacity CROSS JOIN generate_series(1,8)n;

SELECT set_config('request.jwt.claim.sub','7e3ac7b8-3286-4fcb-aaa9-a850390d787c',true);
SELECT pg_temp.qualification_reject('calculation tampering','22023','{"recommended":16200}');
UPDATE irp_pms.nightly_rates SET amount_minor=14100;
SELECT pg_temp.qualification_reject('stale current rate','PT409');
UPDATE irp_pms.nightly_rates SET amount_minor=14000;
UPDATE irp_pms.nightly_capacity SET units=9;
SELECT pg_temp.qualification_reject('stale capacity','PT409');
UPDATE irp_pms.nightly_capacity SET units=10;
UPDATE irp_pms.reservations SET status='Cancelled' WHERE source_booking_id='rollback-8';
SELECT pg_temp.qualification_reject('stale reservation occupancy','PT409');
UPDATE irp_pms.reservations SET status='Confirmed' WHERE source_booking_id='rollback-8';
UPDATE irp_pms.rate_plans SET version=2;
SELECT pg_temp.qualification_reject('stale plan version','PT409');
UPDATE irp_pms.rate_plans SET version=1;
SELECT set_config('request.jwt.claim.sub','451c631e-2e3f-4293-b78c-e1bb92087f20',true);
SELECT pg_temp.qualification_reject('staff write denial','42501');
SELECT set_config('request.jwt.claim.sub','7e3ac7b8-3286-4fcb-aaa9-a850390d787c',true);
INSERT INTO irp_pms.properties(tenant_id,id,name,currency)
VALUES('00000000-0000-4000-8000-000000000001','7d9add80-216e-435c-86e9-58e17cdcbb6d','Synthetic shadow denial fixture','USD');
SELECT pg_temp.qualification_reject('Red Roof shadow write denial','42501','{"property":"7d9add80-216e-435c-86e9-58e17cdcbb6d"}');

DO $$
DECLARE receipt jsonb;
BEGIN
 receipt:=pg_temp.qualification_apply();
 IF receipt->>'replayed' IS DISTINCT FROM 'false'
 OR (receipt->>'recommended_rate_minor')::bigint IS DISTINCT FROM 16100
 OR (SELECT amount_minor FROM irp_pms.nightly_rates) IS DISTINCT FROM 16100
 OR (SELECT version FROM irp_pms.rate_plans) IS DISTINCT FROM 2
 OR (SELECT count(*) FROM irp_pms.rate_actions)<>1
 OR (SELECT count(*) FROM irp_pms.activity)<>2
 OR (SELECT count(*) FROM irp_pms.revenue_rate_decisions)<>2
 THEN RAISE EXCEPTION 'Atomic save did not produce one price change and audit receipt'; END IF;
 INSERT INTO revenue_qualification_results VALUES('atomic rate plus audit save',true);
 receipt:=pg_temp.qualification_apply();
 IF receipt->>'replayed' IS DISTINCT FROM 'true'
 OR (SELECT count(*) FROM irp_pms.rate_actions)<>1
 OR (SELECT count(*) FROM irp_pms.activity)<>2
 OR (SELECT count(*) FROM irp_pms.revenue_rate_decisions)<>2
 THEN RAISE EXCEPTION 'Replay duplicated a saved change'; END IF;
 INSERT INTO revenue_qualification_results VALUES('duplicate retry is idempotent',true);
END $$;
SELECT pg_temp.qualification_reject('conflicting retry rejected','23505','{"notes":["Conflicting review"]}');

CREATE FUNCTION pg_temp.qualification_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Synthetic injected audit failure' USING ERRCODE='P0001'; END $$;
CREATE TRIGGER qualification_audit_failure BEFORE INSERT ON irp_pms.revenue_rate_decisions
FOR EACH ROW EXECUTE FUNCTION pg_temp.qualification_audit_failure();
SELECT pg_temp.qualification_reject('audit failure rejects entire save','P0001',
 '{"request":"00000000-0000-4000-8000-000000000021","version":2,"current":16100,"recommended":18515}');
DO $$
BEGIN
 IF (SELECT amount_minor FROM irp_pms.nightly_rates) IS DISTINCT FROM 16100
 OR (SELECT version FROM irp_pms.rate_plans) IS DISTINCT FROM 2
 OR (SELECT count(*) FROM irp_pms.rate_actions)<>1
 OR (SELECT count(*) FROM irp_pms.activity)<>2
 OR (SELECT count(*) FROM irp_pms.revenue_rate_decisions)<>2
 THEN RAISE EXCEPTION 'Audit failure left a partial price change'; END IF;
 INSERT INTO revenue_qualification_results VALUES('audit failure rolls back price version and logs',true);
END $$;
SELECT jsonb_build_object('gate','rollback-only native PostgreSQL audited save',
 'passed',count(*),'cases',jsonb_agg(case_name ORDER BY case_name),
 'signed_http_write_qualified',false,'persistent_writes',false) AS qualification
FROM revenue_qualification_results;
ROLLBACK;
