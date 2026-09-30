-- ISOLATED ONLY. Install pricing slice, repaired candidate and dependency ACL parity first.
-- Seed one synthetic property using the existing receipt-race seed, then add these actors.
-- Execute each BEGIN ... COMMIT/ROLLBACK case independently, not as a single client transaction.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r')<>19
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification')
 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000008'),('00000000-0000-4000-8000-000000000009'),('00000000-0000-4000-8000-000000000010');
INSERT INTO irp_pms.memberships VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000008','manager'),('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','staff');

-- CASE authenticated_owner_save
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true); SELECT public.irp_pms_pilot_apply_revenue_decision('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004',1,'2026-10-01',14000,16100,7000,21000,NULL,0,10,8,800,1500,'none','["Reviewed inputs"]'::jsonb) receipt; COMMIT;
-- CASE owner_saved_status
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 result:=public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); IF result->>'found' IS DISTINCT FROM 'true' OR result->>'request_id'<>'00000000-0000-4000-8000-000000000006' OR (result->>'recommended_rate_minor')::integer<>16100 THEN RAISE EXCEPTION 'Owner receipt mismatch'; END IF;
END $$;
SELECT jsonb_build_object('case','owner_saved_status','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE manager_other_actor_hidden
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 result:=public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); IF result->>'found' IS DISTINCT FROM 'false' OR result?'saved_at' THEN RAISE EXCEPTION 'Other actor receipt exposed'; END IF;
END $$;
SELECT jsonb_build_object('case','manager_other_actor_hidden','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE manager_property_history
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 result:=public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'); IF jsonb_array_length(result->'items')<>1 OR result->'items'->0->>'actor_id'<>'00000000-0000-4000-8000-000000000005' THEN RAISE EXCEPTION 'Manager scoped history mismatch'; END IF;
END $$;
SELECT jsonb_build_object('case','manager_property_history','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE staff_status_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','staff_status_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE staff_history_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','staff_history_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE outsider_status_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','outsider_status_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE missing_actor_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','missing_actor_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE wrong_tenant_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','wrong_tenant_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE wrong_property_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','wrong_property_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE anon_status_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'anon' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','anon_status_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE service_status_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','service_status_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE authenticated_table_read_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM 1 FROM irp_pms.revenue_rate_decisions; RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','authenticated_table_read_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE authenticated_table_update_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN UPDATE irp_pms.revenue_rate_decisions SET recommended_rate_minor=1; RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','authenticated_table_update_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE incomplete_history_cursor_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',clock_timestamp(),NULL); RAISE EXCEPTION 'Expected 22023'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','incomplete_history_cursor_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- CASE spoofed_metadata_staff_denied
-- Execute this case independently; expected failures are caught inside the transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',true);
DO $$ DECLARE result jsonb; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","user_metadata":{"role":"owner"}}',true); BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Expected 42501 denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','spoofed_metadata_staff_denied','role',current_user,'actor',auth.uid(),'passed',true) result;
ROLLBACK;

-- ISOLATED ONLY: guarded synthetic fixture, all cloned audit rows roll back.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r')<>19
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification')
 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
INSERT INTO irp_pms.revenue_rate_decisions
SELECT (jsonb_populate_record(NULL::irp_pms.revenue_rate_decisions,to_jsonb(d)||jsonb_build_object('request_id','00000000-0000-4000-8000-'||lpad(n::text,12,'0')))).*
FROM irp_pms.revenue_rate_decisions d CROSS JOIN generate_series(100,126)n WHERE d.request_id='00000000-0000-4000-8000-000000000006';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ DECLARE first_page jsonb; second_page jsonb; combined jsonb; ids text[]; expected text[]; BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 first_page:=public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
 second_page:=public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',(first_page->'next'->>'saved_at')::timestamptz,(first_page->'next'->>'request_id')::uuid);
 IF jsonb_array_length(first_page->'items')<>25 OR jsonb_array_length(second_page->'items')<>3 OR second_page->'next'<>'null'::jsonb
 OR first_page->'next'->>'request_id' IS DISTINCT FROM first_page->'items'->-1->>'request_id'
 THEN RAISE EXCEPTION 'Page boundary mismatch'; END IF;
 combined:=(first_page->'items')||(second_page->'items');
 SELECT array_agg(value->>'request_id' ORDER BY ord) INTO ids FROM jsonb_array_elements(combined) WITH ORDINALITY AS x(value,ord);
 SELECT array_agg(id ORDER BY id DESC) INTO expected FROM (SELECT '00000000-0000-4000-8000-000000000006' id UNION ALL SELECT '00000000-0000-4000-8000-'||lpad(n::text,12,'0') FROM generate_series(100,126)n)x;
 IF ids IS DISTINCT FROM expected THEN RAISE EXCEPTION 'History skipped or duplicated records'; END IF;
END $$;
WITH first_page AS (SELECT public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002') page),
second_page AS (SELECT public.irp_pms_pilot_revenue_decisions('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',(page->'next'->>'saved_at')::timestamptz,(page->'next'->>'request_id')::uuid) page FROM first_page)
SELECT jsonb_build_object('case','tied_timestamp_pagination','role',current_user,'first_count',jsonb_array_length(f.page->'items'),'second_count',jsonb_array_length(s.page->'items'),'cursor',f.page->'next','last_next',s.page->'next','passed',true) result FROM first_page f CROSS JOIN second_page s;
ROLLBACK;

BEGIN;
UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND user_id='00000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 BEGIN PERFORM public.irp_pms_pilot_revenue_decision_status('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006'); RAISE EXCEPTION 'Demoted receipt unexpectedly visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT jsonb_build_object('case','demoted_owner_status_denied','role',current_user,'passed',true) result;
ROLLBACK;
