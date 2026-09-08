-- Transaction-only synthetic security-deposit proof. No money is moved.
-- Existing confirmed owner identity is read only; every new row rolls back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp172_assert(p_condition boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message;END IF;END $$;
CREATE FUNCTION pg_temp.irp172_expect_rejection(p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 IF p_code IS NULL THEN RAISE EXCEPTION 'A rejection code is required';END IF;
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE IS DISTINCT FROM p_code THEN RAISE;END IF;
  rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection did not occur' USING ERRCODE='P0004';END IF;
END $$;
DO $helper_test$
DECLARE caught boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.irp172_expect_rejection('SELECT 1','P0001');
 EXCEPTION WHEN SQLSTATE 'P0004' THEN caught:=true;END;
 PERFORM pg_temp.irp172_assert(caught,'Rejection helper accepted successful SQL');
 PERFORM pg_temp.irp172_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Intended rejection'' USING ERRCODE=''P0001'';END $e$','P0001');
 caught:=false;
 BEGIN PERFORM pg_temp.irp172_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Wrong rejection'' USING ERRCODE=''42501'';END $e$','P0001');
 EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;
 PERFORM pg_temp.irp172_assert(caught,'Rejection helper accepted the wrong SQLSTATE');
 caught:=false;
 BEGIN PERFORM pg_temp.irp172_assert(NULL,'Intended null rejection');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN caught:=true;END;
 PERFORM pg_temp.irp172_assert(caught,'Positive helper accepted SQL NULL');
END $helper_test$;
SELECT 'security_deposit_rejection_helper_self_test_passed' AS verification;
CREATE FUNCTION pg_temp.irp172_command(p_detail jsonb,p_kind text,p_amount bigint,p_target uuid DEFAULT NULL,p_method text DEFAULT 'cash') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('reservation_id',p_detail->'reservation'->>'id','expected_version',(p_detail->>'version')::bigint,'expected_recording_time_zone',p_detail->>'recording_time_zone','expected_recording_date',p_detail->>'recording_date','kind',p_kind,'amount_minor',p_amount,'method',p_method,'reference','TEST172 external record','reason','Transaction-only fictional security funds','target_event_id',p_target,'confirmed',true)
$$;
CREATE FUNCTION pg_temp.irp172_post(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_record_security_deposit(p_tenant,p_property,(p_command->>'reservation_id')::uuid,p_request,(p_command->>'expected_version')::bigint,p_command->>'expected_recording_time_zone',(p_command->>'expected_recording_date')::date,p_command->>'kind',(p_command->>'amount_minor')::bigint,p_command->>'method',p_command->>'reference',p_command->>'reason',(p_command->>'target_event_id')::uuid,(p_command->>'confirmed')::boolean);
END $$;
DO $setup$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test organization owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only172 security deposits');
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp172.actor',actor::text,true);PERFORM set_config('irp172.tenant',t::text,true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $hotel$
DECLARE t uuid:=current_setting('irp172.tenant')::uuid;p uuid;rt uuid;r uuid;room jsonb;made jsonb;d jsonb;c jsonb;x jsonb;first jsonb;first_c jsonb;first_request uuid:=gen_random_uuid();day date;retired jsonb;retire_request uuid:=gen_random_uuid();report jsonb;bad uuid:=gen_random_uuid();
BEGIN
 made:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary172 hotel','America/Chicago','hotel',NULL);p:=(made->>'property_id')::uuid;
 rt:=(public.irp_pms_pilot_save_room_type(t,p,NULL,'Synthetic172 type',2)->>'id')::uuid;
 room:=public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP172-101');
 day:=(public.irp_pms_pilot_workspace(t,p)->>'business_date')::date;
 PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,day,day+3,1);
 r:=(public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic172 hotel deposit',day,day+2,1,0,0)->>'id')::uuid;
 d:=public.irp_pms_pilot_security_deposit(t,p,r);
 PERFORM pg_temp.irp172_assert(d->'book'='null'::jsonb AND d->'totals'='null'::jsonb AND (d->>'version')::bigint=0 AND d->'events'='[]'::jsonb,'Absent hotel book was inferred');
 first_c:=pg_temp.irp172_command(d,'external_receipt',10000);first:=pg_temp.irp172_post(t,p,first_request,first_c);
 PERFORM pg_temp.irp172_assert(first->>'outcome'='recorded' AND (first->'book'->>'version')::bigint=1 AND (first->'book'->'totals'->>'held_minor')::bigint=10000 AND first->'folio_changed'='false'::jsonb AND first->'revenue_changed'='false'::jsonb,'First hotel receipt result is incomplete');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);c:=pg_temp.irp172_command(d,'external_refund',3000,(first->'event'->>'id')::uuid,'bank_transfer');x:=pg_temp.irp172_post(t,p,gen_random_uuid(),c);
 PERFORM pg_temp.irp172_assert(x->'event'->>'recorded_method'='bank_transfer' AND (x->'book'->>'version')::bigint=2,'Linked external refund is incomplete');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);c:=pg_temp.irp172_command(d,'receipt_reduction',1000,(first->'event'->>'id')::uuid,NULL);x:=pg_temp.irp172_post(t,p,gen_random_uuid(),c);
 PERFORM pg_temp.irp172_assert(x->'book'->'totals'='{"received_minor":10000,"refunded_minor":3000,"reduced_minor":1000,"held_minor":6000}'::jsonb AND x->'event'->'recorded_method'='null'::jsonb AND (x->'book'->>'version')::bigint=3,'Receipt reduction equation is incomplete');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);c:=pg_temp.irp172_command(d,'external_refund',6001,(first->'event'->>'id')::uuid,'cash');
 PERFORM pg_temp.irp172_expect_rejection(format('SELECT pg_temp.irp172_post(%L,%L,%L,%L::jsonb)',t,p,bad,c),'P0001');
 PERFORM pg_temp.irp172_assert(public.irp_pms_pilot_security_deposit_request_status(t,p,bad)='{"found":false}'::jsonb,'Rejected over-refund retained a receipt');
 c:=pg_temp.irp172_command(d,'external_receipt',1);
 PERFORM pg_temp.irp172_expect_rejection(format('SELECT pg_temp.irp172_post(%L,%L,%L,%L::jsonb)',t,p,gen_random_uuid(),c||jsonb_build_object('expected_version',2)),'PT409');
 PERFORM pg_temp.irp172_expect_rejection(format('SELECT pg_temp.irp172_post(%L,%L,%L,%L::jsonb)',t,p,gen_random_uuid(),c||jsonb_build_object('expected_recording_date',day-1)),'PT412');
 PERFORM pg_temp.irp172_assert(pg_temp.irp172_post(t,p,first_request,first_c)=first||jsonb_build_object('replayed',true),'Historical first receipt was rewritten');
 PERFORM pg_temp.irp172_assert(public.irp_pms_pilot_retire_security_deposit_request(t,p,r,first_request,first_c,'Already recorded receipt recovery')=first||jsonb_build_object('replayed',true),'Record-before-retire did not recover receipt');
 c:=c||jsonb_build_object('expected_recording_date',day-1);
 retired:=public.irp_pms_pilot_retire_security_deposit_request(t,p,r,retire_request,c,'Retire equal-version uncertain request');
 PERFORM pg_temp.irp172_assert(retired->>'outcome'='retired' AND retired->'command'=c AND retired->'financial_changed'='false'::jsonb AND retired->'book_version_changed'='false'::jsonb,'Retirement result is incomplete');
 PERFORM pg_temp.irp172_assert(pg_temp.irp172_post(t,p,retire_request,c)=retired||jsonb_build_object('replayed',true),'Retire-before-post failed to fence delayed write');
 PERFORM pg_temp.irp172_assert(public.irp_pms_pilot_security_deposit_request_status(t,p,retire_request)=jsonb_build_object('found',true,'action','retire_security_deposit_request','result',retired),'Retired request status is incomplete');
 PERFORM pg_temp.irp172_expect_rejection(format('SELECT pg_temp.irp172_post(%L,%L,%L,%L::jsonb)',t,p,retire_request,c||jsonb_build_object('amount_minor',2)),'P0001');
 PERFORM public.irp_pms_pilot_configure_property(t,p,'Temporary172 renamed hotel','UTC');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);
 PERFORM pg_temp.irp172_assert(d->>'property_time_zone'='UTC' AND d->>'recording_time_zone'='America/Chicago' AND (d->>'version')::bigint=3 AND (d->'totals'->>'held_minor')::bigint=6000,'Frozen recording context or retirement changed book');
 report:=public.irp_pms_pilot_security_deposit_register(t,p);
 PERFORM pg_temp.irp172_assert((report->'summary'->>'book_count')::bigint=1 AND report->'totals'=d->'totals' AND jsonb_array_length(report->'rows')=1,'Hotel register does not reconcile');
 report:=public.irp_pms_pilot_security_deposit_activity(t,p,day,day+1);
 PERFORM pg_temp.irp172_assert(report->'totals'='{"event_count":3,"received_minor":10000,"refunded_minor":3000,"reduced_minor":1000,"held_effect_minor":6000}'::jsonb AND jsonb_array_length(report->'rows')=3,'Hotel activity does not reconcile');
 PERFORM set_config('irp172.hotel',jsonb_build_object('property',p,'reservation',r,'date',day,'request',first_request,'command',first_c)::text,true);
END $hotel$;
DO $home$
DECLARE t uuid:=current_setting('irp172.tenant')::uuid;made jsonb;p uuid;rt uuid;r uuid;day date;d jsonb;c jsonb;retired jsonb;first jsonb;x jsonb;request uuid:=gen_random_uuid();
BEGIN
 made:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary172 home','UTC','whole_home',4);p:=(made->>'property_id')::uuid;rt:=(made->>'room_type_id')::uuid;
 day:=(public.irp_pms_pilot_workspace(t,p)->>'business_date')::date;PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,day,day+3,1);
 r:=(public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic172 home deposit',day,day+2,1,0,0)->>'id')::uuid;
 d:=public.irp_pms_pilot_security_deposit(t,p,r);c:=pg_temp.irp172_command(d,'external_receipt',10000);
 retired:=public.irp_pms_pilot_retire_security_deposit_request(t,p,r,request,c,'Stop uncertain first home receipt');
 PERFORM pg_temp.irp172_assert(retired->>'outcome'='retired' AND retired->'financial_changed'='false'::jsonb AND retired->'book_version_changed'='false'::jsonb,'Absent-book retirement result is incomplete');
 PERFORM pg_temp.irp172_assert(pg_temp.irp172_post(t,p,request,c)=retired||jsonb_build_object('replayed',true),'Absent-book retirement did not fence delayed receipt');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);
 PERFORM pg_temp.irp172_assert(d->'book'='null'::jsonb AND d->'totals'='null'::jsonb AND (d->>'version')::bigint=0,'Retirement inferred a home book');
 first:=pg_temp.irp172_post(t,p,gen_random_uuid(),pg_temp.irp172_command(d,'external_receipt',10000));
 PERFORM pg_temp.irp172_assert(first->>'outcome'='recorded' AND first->'book'->>'creation_operating_model'='whole_home' AND (first->'book'->>'version')::bigint=1,'Home receipt result is incomplete');
 d:=public.irp_pms_pilot_security_deposit(t,p,r);x:=pg_temp.irp172_post(t,p,gen_random_uuid(),pg_temp.irp172_command(d,'external_refund',10000,(first->'event'->>'id')::uuid,'card'));
 d:=public.irp_pms_pilot_security_deposit(t,p,r);
 PERFORM pg_temp.irp172_assert(x->'book'->'totals'='{"received_minor":10000,"refunded_minor":10000,"reduced_minor":0,"held_minor":0}'::jsonb AND (d->>'version')::bigint=2 AND jsonb_typeof(d->'book')='object' AND jsonb_array_length(d->'refundable_receipts')=1 AND (d->'refundable_receipts'->0->>'remaining_minor')::bigint=0,'Exhausted home book or target is incomplete');
 x:=public.irp_pms_pilot_security_deposit_register(t,p);
 PERFORM pg_temp.irp172_assert((x->'summary'->>'zero_held_count')::bigint=1 AND (x->'summary'->>'book_count')::bigint=1,'Zero-held home register is incomplete');
 PERFORM pg_temp.irp172_assert(public.irp_pms_pilot_security_deposit_request_status(t,p,(current_setting('irp172.hotel')::jsonb->>'request')::uuid)='{"found":false}'::jsonb,'Receipt crossed property scope');
 PERFORM set_config('irp172.home',jsonb_build_object('property',p,'reservation',r,'date',day)::text,true);
END $home$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
DO $integrity$
DECLARE t uuid:=current_setting('irp172.tenant')::uuid;
BEGIN
 PERFORM pg_temp.irp172_assert((SELECT count(*)=2 FROM irp_pms.security_deposit_books WHERE tenant_id=t),'Unexpected book count');
 PERFORM pg_temp.irp172_assert((SELECT count(*)=5 FROM irp_pms.security_deposit_events WHERE tenant_id=t),'Unexpected event count');
 PERFORM pg_temp.irp172_assert((SELECT count(*)=5 FROM irp_pms.security_deposit_requests WHERE tenant_id=t AND outcome='recorded'),'Recorded receipt count mismatch');
 PERFORM pg_temp.irp172_assert((SELECT count(*)=2 FROM irp_pms.security_deposit_requests WHERE tenant_id=t AND outcome='retired'),'Retirement count mismatch');
 PERFORM pg_temp.irp172_assert((SELECT count(*)=5 FROM irp_pms.activity WHERE tenant_id=t AND action='security_deposit_recorded'),'Event audit count mismatch');
 PERFORM pg_temp.irp172_assert((SELECT count(*)=2 FROM irp_pms.activity WHERE tenant_id=t AND action='security_deposit_request_retired'),'Retirement audit count mismatch');
 PERFORM pg_temp.irp172_assert(NOT EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=t),'Deposit proof posted folio entries');
 PERFORM pg_temp.irp172_assert(NOT EXISTS(SELECT 1 FROM irp_pms.folio_openings WHERE tenant_id=t),'Deposit proof opened a folio');
 PERFORM pg_temp.irp172_assert(NOT EXISTS(SELECT 1 FROM irp_pms.reservation_charge_snapshots WHERE tenant_id=t),'Deposit proof created charge snapshots');
 PERFORM pg_temp.irp172_assert(NOT EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=t),'Deposit proof generated cleaning work');
 PERFORM pg_temp.irp172_assert(NOT EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=t AND (accommodation_minor IS DISTINCT FROM 0 OR taxes_minor IS DISTINCT FROM 0 OR hotel_fees_minor IS DISTINCT FROM 0 OR ota_fees_minor IS DISTINCT FROM 0 OR guest_total_minor IS DISTINCT FROM 0 OR charge_breakdown IS NOT NULL OR status IS DISTINCT FROM 'Confirmed')),'Deposit proof changed stay financials or lifecycle');
END $integrity$;
SET LOCAL ROLE anon;
SELECT pg_temp.irp172_expect_rejection(format('SELECT public.irp_pms_pilot_security_deposit_register(%L,%L)',current_setting('irp172.tenant'),current_setting('irp172.hotel')::jsonb->>'property'),'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.irp172_expect_rejection(format('SELECT public.irp_pms_pilot_security_deposit_register(%L,%L)',current_setting('irp172.tenant'),current_setting('irp172.hotel')::jsonb->>'property'),'42501');
RESET ROLE;
SELECT 'security_deposit_transaction_proof_passed' AS verification;
ROLLBACK;
