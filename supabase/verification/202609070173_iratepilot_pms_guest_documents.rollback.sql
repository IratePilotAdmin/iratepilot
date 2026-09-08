-- Transaction-only document proof. New fictional tenant uses an existing
-- confirmed owner; all fixtures roll back. No guest delivery or money movement.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp173_assert(p_condition boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message;END IF;END $$;
CREATE FUNCTION pg_temp.irp173_expect_rejection(p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 IF p_code IS NULL THEN RAISE EXCEPTION 'A rejection code is required';END IF;
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE IS DISTINCT FROM p_code THEN RAISE;END IF;rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection did not occur' USING ERRCODE='P0004';END IF;
END $$;
DO $helpers$
DECLARE caught boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.irp173_expect_rejection('SELECT 1','P0001');EXCEPTION WHEN SQLSTATE 'P0004' THEN caught:=true;END;
 PERFORM pg_temp.irp173_assert(caught,'Rejection helper accepted successful SQL');
 PERFORM pg_temp.irp173_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Intended rejection'' USING ERRCODE=''P0001'';END $e$','P0001');
 caught:=false;BEGIN PERFORM pg_temp.irp173_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Wrong code'' USING ERRCODE=''42501'';END $e$','P0001');EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;PERFORM pg_temp.irp173_assert(caught,'Wrong SQLSTATE was accepted');
 caught:=false;BEGIN PERFORM pg_temp.irp173_assert(NULL,'Intended null rejection');EXCEPTION WHEN SQLSTATE 'P0001' THEN caught:=true;END;PERFORM pg_temp.irp173_assert(caught,'SQL NULL positive evidence was accepted');
END $helpers$;
SELECT 'guest_documents_helper_self_test_passed' AS verification;
CREATE FUNCTION pg_temp.irp173_state() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:='{}';r record;fingerprint text;
BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(x)::text,''|'' ORDER BY to_jsonb(x)::text),'''')) FROM irp_pms.%I x',r.tablename) INTO fingerprint;
  result:=result||jsonb_build_object(r.tablename,fingerprint);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(result)) IS DISTINCT FROM 53::bigint THEN RAISE EXCEPTION 'Expected all53 source PMS tables';END IF;
 RETURN result;
END $$;
CREATE FUNCTION pg_temp.irp173_document(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_guest_documents(p_tenant,p_property,p_reservation);
END $$;
DO $tenant$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test organization owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only173 guest documents');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp173.actor',actor::text,true);PERFORM set_config('irp173.tenant',t::text,true);
END $tenant$;
SET LOCAL ROLE authenticated;
DO $fixtures$
DECLARE t uuid:=current_setting('irp173.tenant')::uuid;p uuid;rt uuid;r jsonb;home jsonb;home_res jsonb;d date;profile jsonb;prop jsonb;deposit jsonb;
BEGIN
 prop:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary173 hotel','America/Chicago','hotel',NULL);p:=(prop->>'property_id')::uuid;rt:=(public.irp_pms_pilot_save_room_type(t,p,NULL,'Temporary173 room',2)->>'id')::uuid;
 PERFORM public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP173-101');d:=(public.irp_pms_pilot_workspace(t,p)->>'business_date')::date;PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+3,1);
 r:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'TEST173 documented hotel',d,d+2,1,5000,500);
 profile:=public.irp_pms_pilot_save_guest_profile(t,p,gen_random_uuid(),NULL,NULL,'{"display_name":"TEST173 saved contact","email":"saved173@example.invalid"}');
 PERFORM public.irp_pms_pilot_save_reservation_guest(t,p,(r->>'id')::uuid,gen_random_uuid(),0,(profile->>'guest_id')::uuid,(profile->>'version')::bigint,NULL,'{"legal_name":"TEST173 bill to","address_line1":"TEST173 billing address"}',false);
 PERFORM public.irp_pms_pilot_save_guest_profile(t,p,gen_random_uuid(),(profile->>'guest_id')::uuid,(profile->>'version')::bigint,'{"display_name":"TEST173 newer profile","email":"newer173@example.invalid"}');
 PERFORM public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'charge',1000,'TEST173 internal charge','TEST173 PRIVATE INTERNAL REASON',NULL);
 PERFORM public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'external_payment',2500,'TEST173 internal payment','TEST173 PRIVATE INTERNAL REASON',NULL);
 deposit:=public.irp_pms_pilot_security_deposit(t,p,(r->>'id')::uuid);
 PERFORM public.irp_pms_pilot_record_security_deposit(t,p,(r->>'id')::uuid,gen_random_uuid(),0,deposit->>'recording_time_zone',(deposit->>'recording_date')::date,'external_receipt',10000,'cash','TEST173 internal deposit','TEST173 PRIVATE INTERNAL REASON',NULL,true);
 PERFORM public.irp_pms_pilot_amend_reservation(t,p,(r->>'id')::uuid,gen_random_uuid(),(r->>'source_version')::bigint,r->>'guest_name',rt,d,d+2,1,6000,500);
 home:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary173 home','UTC','whole_home',4);d:=(public.irp_pms_pilot_workspace(t,(home->>'property_id')::uuid)->>'business_date')::date;
 PERFORM public.irp_pms_pilot_set_capacity(t,(home->>'property_id')::uuid,(home->>'room_type_id')::uuid,d,d+3,1);
 home_res:=public.irp_pms_pilot_create_reservation(t,(home->>'property_id')::uuid,gen_random_uuid(),(home->>'room_type_id')::uuid,'TEST173 documented home',d,d+2,1,0,0);
 PERFORM set_config('irp173.hotel',jsonb_build_object('property',p,'reservation',r->>'id')::text,true);PERFORM set_config('irp173.home',jsonb_build_object('property',home->>'property_id','reservation',home_res->>'id')::text,true);
END $fixtures$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('irp173.baseline',pg_temp.irp173_state()::text,true) IS NOT NULL AS baseline_saved;
SET LOCAL ROLE authenticated;
DO $documents$
DECLARE t uuid:=current_setting('irp173.tenant')::uuid;h jsonb:=current_setting('irp173.hotel')::jsonb;home jsonb:=current_setting('irp173.home')::jsonb;x jsonb;y jsonb;e jsonb;
BEGIN
 x:=pg_temp.irp173_document(t,(h->>'property')::uuid,(h->>'reservation')::uuid);
 PERFORM pg_temp.irp173_assert(x->>'tenant_id'=t::text AND x->>'property_id'=h->>'property' AND x->>'reservation_id'=h->>'reservation' AND x->>'actor_id'=current_setting('irp173.actor') AND x->'schema_version'='1'::jsonb,'Hotel document context is incomplete');
 PERFORM pg_temp.irp173_assert(x->'stay_guest'->'contact'->>'email'='saved173@example.invalid' AND x->'stay_guest'->'billing_party'->>'legal_name'='TEST173 bill to' AND x->'stay_guest'->'linked_profile_changed'='true'::jsonb,'Saved guest or billing snapshot was replaced');
 PERFORM pg_temp.irp173_assert(x->'account'->>'opening_mode'='frozen' AND (x->'account'->'opening'->>'total_minor')::bigint=5500 AND (x->'account'->'totals'->>'charges_minor')::bigint=6500 AND (x->'account'->'totals'->>'paid_minor')::bigint=2500 AND (x->'account'->'totals'->>'balance_minor')::bigint=4000 AND x->'account'->'reservation_amounts_changed'='true'::jsonb,'Frozen account equation or drift is incomplete');
 PERFORM pg_temp.irp173_assert(jsonb_typeof(x->'account'->'entries')='array' AND jsonb_array_length(x->'account'->'entries')=2 AND (x->'completeness'->>'folio_entry_count')::bigint=2,'Hotel document entry evidence is incomplete');
 PERFORM pg_temp.irp173_assert((SELECT count(*)=1 FROM jsonb_array_elements(x->'account'->'entries') v WHERE v->>'kind'='charge' AND (v->>'amount_minor')::bigint=1000 AND (v->>'charge_effect_minor')::bigint=1000 AND (v->>'payment_effect_minor')::bigint=0 AND (v->>'balance_effect_minor')::bigint=1000),'Hotel document charge effect is incomplete');
 PERFORM pg_temp.irp173_assert((SELECT count(*)=1 FROM jsonb_array_elements(x->'account'->'entries') v WHERE v->>'kind'='external_payment' AND (v->>'amount_minor')::bigint=2500 AND (v->>'charge_effect_minor')::bigint=0 AND (v->>'payment_effect_minor')::bigint=2500 AND (v->>'balance_effect_minor')::bigint=-2500),'Hotel document payment effect is incomplete');
 PERFORM pg_temp.irp173_assert((x->'security_deposit'->'totals'->>'held_minor')::bigint=10000 AND x->'security_deposit'->'applied_to_account'='false'::jsonb,'Security funds were inferred as an account payment');
 PERFORM pg_temp.irp173_assert(position('PRIVATE INTERNAL REASON' IN x::text)=0 AND position('newer173@example.invalid' IN x::text)=0,'Private financial note or current reusable contact leaked');
 FOR e IN SELECT v FROM jsonb_array_elements(x->'account'->'entries') v LOOP PERFORM pg_temp.irp173_assert(NOT(e ?| ARRAY['reference','reason','actor_id','request_id']),'Internal entry metadata leaked');END LOOP;
 y:=pg_temp.irp173_document(t,(h->>'property')::uuid,(h->>'reservation')::uuid);PERFORM pg_temp.irp173_assert(y->'account'=x->'account' AND y->'stay_guest'=x->'stay_guest' AND y->'security_deposit'=x->'security_deposit','Repeated document reads changed source views');
 x:=pg_temp.irp173_document(t,(home->>'property')::uuid,(home->>'reservation')::uuid);
 PERFORM pg_temp.irp173_assert(x->'property'->>'operating_model'='whole_home' AND x->'stay_guest'->'recorded'='false'::jsonb AND x->'stay_guest'->'contact'='null'::jsonb AND x->'account'->>'opening_mode'='reservation_preview' AND (x->'account'->'totals'->>'balance_minor')::bigint=0 AND x->'security_deposit'->'recorded'='false'::jsonb AND x->'security_deposit'->'totals'='null'::jsonb,'Home preview inferred saved contact or security book');
 PERFORM pg_temp.irp173_assert(x->'semantics'->'folio_opened'='false'::jsonb AND x->'semantics'->'financial_records_changed'='false'::jsonb AND x->'completeness'->'complete'='true'::jsonb AND x->'completeness'->'rows_truncated'='false'::jsonb,'Document read semantics are incomplete');
 PERFORM pg_temp.irp173_expect_rejection(format('SELECT public.irp_pms_pilot_guest_documents(%L,%L,%L)',t,h->>'property',home->>'reservation'),'P0001');
END $documents$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.irp173_expect_rejection(format('SELECT public.irp_pms_pilot_guest_documents(%L,%L,%L)',current_setting('irp173.tenant'),current_setting('irp173.hotel')::jsonb->>'property',current_setting('irp173.hotel')::jsonb->>'reservation'),'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.irp173_expect_rejection(format('SELECT public.irp_pms_pilot_guest_documents(%L,%L,%L)',current_setting('irp173.tenant'),current_setting('irp173.hotel')::jsonb->>'property',current_setting('irp173.hotel')::jsonb->>'reservation'),'42501');
RESET ROLE;
SELECT pg_temp.irp173_assert(pg_temp.irp173_state()=current_setting('irp173.baseline')::jsonb,'Document generation changed a source PMS table');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'guest_documents_transaction_proof_passed' AS verification;
ROLLBACK;
