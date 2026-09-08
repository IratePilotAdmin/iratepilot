-- Transaction-only174 proof with new fictional tenant/property/stay records.
-- Reuses an existing confirmed owner without changing any existing identity.
-- External records below are fictional; no processor or other network call.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp174_assert(p_condition boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message;END IF;END $$;
CREATE FUNCTION pg_temp.irp174_expect_rejection(p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 IF p_code IS NULL THEN RAISE EXCEPTION 'A rejection code is required';END IF;
 BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN IF SQLSTATE IS DISTINCT FROM p_code THEN RAISE;END IF;rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection did not occur' USING ERRCODE='P0004';END IF;
END $$;
DO $helpers$
DECLARE caught boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.irp174_expect_rejection('SELECT 1','P0001');EXCEPTION WHEN SQLSTATE 'P0004' THEN caught:=true;END;
 PERFORM pg_temp.irp174_assert(caught,'Rejection helper accepted successful SQL');
 PERFORM pg_temp.irp174_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Intended'' USING ERRCODE=''P0001'';END $e$','P0001');
 caught:=false;BEGIN PERFORM pg_temp.irp174_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Wrong code'' USING ERRCODE=''42501'';END $e$','P0001');EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;PERFORM pg_temp.irp174_assert(caught,'Wrong SQLSTATE was accepted');
 caught:=false;BEGIN PERFORM pg_temp.irp174_assert(NULL,'Intended null rejection');EXCEPTION WHEN SQLSTATE 'P0001' THEN caught:=true;END;PERFORM pg_temp.irp174_assert(caught,'SQL NULL evidence was accepted');
END $helpers$;
SELECT 'payment_record_reviews_helper_self_test_passed' AS verification;
CREATE FUNCTION pg_temp.irp174_state(p_skip text[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:='{}';r record;fingerprint text;
BEGIN
 IF(SELECT count(*) FROM pg_tables WHERE schemaname='irp_pms') IS DISTINCT FROM 56::bigint THEN RAISE EXCEPTION 'Expected all56 PMS tables';END IF;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' AND NOT(tablename=ANY(p_skip)) ORDER BY tablename LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(x)::text,''|'' ORDER BY to_jsonb(x)::text),'''')) FROM irp_pms.%I x',r.tablename) INTO fingerprint;
  result:=result||jsonb_build_object(r.tablename,fingerprint);
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION pg_temp.irp174_detail(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_payment_record_review(p_tenant,p_property,p_reservation,p_entry);
END $$;
CREATE FUNCTION pg_temp.irp174_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_cashier_activity_report(p_tenant,p_property,p_start,p_end);
END $$;
CREATE FUNCTION pg_temp.irp174_command(p_reservation uuid,p_entry uuid,p_version bigint,p_method text,p_basis text,p_reference text,p_detail text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('reservation_id',p_reservation,'entry_id',p_entry,'expected_version',p_version,'method',p_method,'method_detail',p_detail,'evidence_basis',p_basis,'evidence_reference',p_reference,'reason','TEST174 reviewed fictional source','confirmed',true)
$$;
CREATE FUNCTION pg_temp.irp174_save(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.irp_pms_pilot_save_payment_record_review(p_tenant,p_property,(p_command->>'reservation_id')::uuid,(p_command->>'entry_id')::uuid,p_request,(p_command->>'expected_version')::bigint,p_command->>'method',p_command->>'method_detail',p_command->>'evidence_basis',p_command->>'evidence_reference',p_command->>'reason',(p_command->>'confirmed')::boolean)
$$;
DO $tenant$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test organization owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only174 payment reviews');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp174.actor',actor::text,true);PERFORM set_config('irp174.tenant',t::text,true);
END $tenant$;
SET LOCAL ROLE authenticated;
DO $fixtures$
DECLARE t uuid:=current_setting('irp174.tenant')::uuid;p uuid;rt uuid;r jsonb;home jsonb;home_res jsonb;d date;prop jsonb;payment jsonb;refund jsonb;deposit jsonb;received jsonb;home_payment jsonb;
BEGIN
 prop:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary174 hotel','America/Chicago','hotel',NULL);p:=(prop->>'property_id')::uuid;rt:=(public.irp_pms_pilot_save_room_type(t,p,NULL,'Temporary174 room',2)->>'id')::uuid;
 PERFORM public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP174-101');d:=(public.irp_pms_pilot_workspace(t,p)->>'business_date')::date;PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+3,1);
 r:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'TEST174 PRIVATE HOTEL NAME',d,d+2,1,0,0);
 payment:=public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'external_payment',10000,'TEST174 source payment','TEST174 original record evidence',NULL);
 refund:=public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'external_refund',2000,'TEST174 source refund','TEST174 separate refund evidence',(payment->>'entry_id')::uuid);
 PERFORM public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'payment_correction',1000,'TEST174 source correction','TEST174 record correction evidence',(payment->>'entry_id')::uuid);
 deposit:=public.irp_pms_pilot_security_deposit(t,p,(r->>'id')::uuid);
 received:=public.irp_pms_pilot_record_security_deposit(t,p,(r->>'id')::uuid,gen_random_uuid(),0,deposit->>'recording_time_zone',(deposit->>'recording_date')::date,'external_receipt',5000,'cash','TEST174 security receipt','TEST174 fictional separate security',NULL,true);
 PERFORM public.irp_pms_pilot_record_security_deposit(t,p,(r->>'id')::uuid,gen_random_uuid(),1,deposit->>'recording_time_zone',(deposit->>'recording_date')::date,'external_refund',1000,'bank_transfer','TEST174 security refund','TEST174 fictional security return',(received->'event'->>'id')::uuid,true);
 PERFORM public.irp_pms_pilot_record_security_deposit(t,p,(r->>'id')::uuid,gen_random_uuid(),2,deposit->>'recording_time_zone',(deposit->>'recording_date')::date,'receipt_reduction',500,NULL,'TEST174 security reduction','TEST174 fictional recording correction',(received->'event'->>'id')::uuid,true);
 home:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary174 home','UTC','whole_home',4);d:=(public.irp_pms_pilot_workspace(t,(home->>'property_id')::uuid)->>'business_date')::date;
 PERFORM public.irp_pms_pilot_set_capacity(t,(home->>'property_id')::uuid,(home->>'room_type_id')::uuid,d,d+3,1);
 home_res:=public.irp_pms_pilot_create_reservation(t,(home->>'property_id')::uuid,gen_random_uuid(),(home->>'room_type_id')::uuid,'TEST174 PRIVATE HOME NAME',d,d+2,1,0,0);
 home_payment:=public.irp_pms_pilot_post_folio(t,(home->>'property_id')::uuid,(home_res->>'id')::uuid,gen_random_uuid(),'external_payment',1000,'TEST174 home payment','TEST174 home source evidence',NULL);
 PERFORM set_config('irp174.hotel',jsonb_build_object('property',p,'reservation',r->>'id','payment',payment->>'entry_id','refund',refund->>'entry_id')::text,true);PERFORM set_config('irp174.home',jsonb_build_object('property',home->>'property_id','reservation',home_res->>'id','payment',home_payment->>'entry_id')::text,true);
 PERFORM set_config('irp174.document',(public.irp_pms_pilot_guest_documents(t,p,(r->>'id')::uuid)-'generated_at')::text,true);
END $fixtures$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('irp174.financial_baseline',pg_temp.irp174_state(ARRAY['activity','payment_record_review_heads','payment_record_reviews','payment_record_review_requests'])::text,true) IS NOT NULL AS baseline_saved;
SELECT set_config('irp174.activity_baseline',(SELECT count(*)::text FROM irp_pms.activity WHERE tenant_id=current_setting('irp174.tenant')::uuid),true) IS NOT NULL AS activity_baseline_saved;
SET LOCAL ROLE authenticated;
DO $reviews$
DECLARE t uuid:=current_setting('irp174.tenant')::uuid;h jsonb:=current_setting('irp174.hotel')::jsonb;home jsonb:=current_setting('irp174.home')::jsonb;first_request uuid:=gen_random_uuid();request uuid;c jsonb;first_result jsonb;x jsonb;y jsonb;stopped jsonb;
BEGIN
 x:=pg_temp.irp174_detail(t,(h->>'property')::uuid,(h->>'reservation')::uuid,(h->>'payment')::uuid);
 PERFORM pg_temp.irp174_assert(x->>'actor_id'=current_setting('irp174.actor') AND x->'recorded'='false'::jsonb AND x->'version'='0'::jsonb AND x->'head'='null'::jsonb AND x->'reviews'='[]'::jsonb,'Initial review detail is incomplete');
 c:=pg_temp.irp174_command((h->>'reservation')::uuid,(h->>'payment')::uuid,0,'cash','external_record_reviewed','TEST174 independently inspected');first_result:=pg_temp.irp174_save(t,(h->>'property')::uuid,first_request,c);
 PERFORM pg_temp.irp174_assert(first_result->>'outcome'='reviewed' AND first_result->'version'='1'::jsonb AND first_result->'command'=c AND first_result->'review'->'source'->'amount_minor'='10000'::jsonb AND first_result->'financial_effects'->'money_moved'='false'::jsonb,'Accepted review receipt is incomplete');
 y:=pg_temp.irp174_save(t,(h->>'property')::uuid,first_request,c);PERFORM pg_temp.irp174_assert(y=first_result||'{"replayed":true}'::jsonb,'Exact review replay changed receipt');
 PERFORM pg_temp.irp174_save(t,(h->>'property')::uuid,gen_random_uuid(),pg_temp.irp174_command((h->>'reservation')::uuid,(h->>'payment')::uuid,1,'unknown','insufficient_evidence',NULL));
 PERFORM pg_temp.irp174_assert(pg_temp.irp174_save(t,(h->>'property')::uuid,first_request,c)=first_result||'{"replayed":true}'::jsonb,'Historical review replay returned current state');
 x:=public.irp_pms_pilot_payment_record_review_request_status(t,(h->>'property')::uuid,first_request);PERFORM pg_temp.irp174_assert(x->'found'='true'::jsonb AND x->'result'=first_result,'Original actor receipt lookup is incomplete');
 PERFORM pg_temp.irp174_expect_rejection(format('SELECT pg_temp.irp174_save(%L,%L,%L,%L::jsonb)',t,h->>'property',gen_random_uuid(),c),'PT409');
 PERFORM pg_temp.irp174_save(t,(h->>'property')::uuid,gen_random_uuid(),pg_temp.irp174_command((h->>'reservation')::uuid,(h->>'refund')::uuid,0,'bank_transfer','operator_report_only',NULL));
 c:=pg_temp.irp174_command((h->>'reservation')::uuid,(h->>'refund')::uuid,1,'cash','operator_report_only',NULL);request:=gen_random_uuid();stopped:=public.irp_pms_pilot_retire_payment_record_review_request(t,(h->>'property')::uuid,(h->>'reservation')::uuid,(h->>'refund')::uuid,request,c,'TEST174 stop uncertain refund review');
 PERFORM pg_temp.irp174_assert(stopped->>'outcome'='retired' AND stopped->'review_version_changed'='false'::jsonb AND stopped->'command'=c AND NOT(stopped ?| ARRAY['review','head','version','source']),'Retired request outcome is incomplete');
 PERFORM pg_temp.irp174_assert(pg_temp.irp174_save(t,(h->>'property')::uuid,request,c)=stopped||'{"replayed":true}'::jsonb,'Retirement did not fence delayed save');
 c:=pg_temp.irp174_command((home->>'reservation')::uuid,(home->>'payment')::uuid,0,'other','operator_report_only',NULL,'TEST174 external voucher');request:=gen_random_uuid();stopped:=public.irp_pms_pilot_retire_payment_record_review_request(t,(home->>'property')::uuid,(home->>'reservation')::uuid,(home->>'payment')::uuid,request,c,'TEST174 stop before first review');
 PERFORM pg_temp.irp174_assert(pg_temp.irp174_save(t,(home->>'property')::uuid,request,c)=stopped||'{"replayed":true}'::jsonb,'First-request fence was bypassed');PERFORM pg_temp.irp174_save(t,(home->>'property')::uuid,gen_random_uuid(),c);
 PERFORM set_config('irp174.first_request',first_request::text,true);PERFORM set_config('irp174.first_result',first_result::text,true);
END $reviews$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.irp174_assert(pg_temp.irp174_state(ARRAY['activity','payment_record_review_heads','payment_record_reviews','payment_record_review_requests'])=current_setting('irp174.financial_baseline')::jsonb,'Review metadata changed an existing financial/configuration/source table');
DO $counts$
DECLARE t uuid:=current_setting('irp174.tenant')::uuid;
BEGIN
 PERFORM pg_temp.irp174_assert((SELECT count(*)=3 FROM irp_pms.payment_record_review_heads WHERE tenant_id=t),'Expected exactly3 review heads');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=4 FROM irp_pms.payment_record_reviews WHERE tenant_id=t),'Expected exactly4 immutable reviews');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=6 FROM irp_pms.payment_record_review_requests WHERE tenant_id=t),'Expected exactly6 request outcomes');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=current_setting('irp174.activity_baseline')::bigint+6 FROM irp_pms.activity WHERE tenant_id=t),'Expected exactly6 new metadata audit rows');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=4 FROM irp_pms.activity WHERE tenant_id=t AND action='payment_record_reviewed' AND details->'financial_changed'='false'::jsonb),'Review audit action pairing is incomplete');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=2 FROM irp_pms.activity WHERE tenant_id=t AND action='payment_record_review_request_retired' AND details->'financial_changed'='false'::jsonb AND details->'review_version_changed'='false'::jsonb),'Retirement audit action pairing is incomplete');
END $counts$;
SELECT set_config('irp174.read_baseline',pg_temp.irp174_state()::text,true) IS NOT NULL AS read_baseline_saved;
SET LOCAL ROLE authenticated;
DO $reads$
DECLARE t uuid:=current_setting('irp174.tenant')::uuid;h jsonb:=current_setting('irp174.hotel')::jsonb;home jsonb:=current_setting('irp174.home')::jsonb;x jsonb;report jsonb;d date;
BEGIN
 x:=pg_temp.irp174_detail(t,(h->>'property')::uuid,(h->>'reservation')::uuid,(h->>'payment')::uuid);
 PERFORM pg_temp.irp174_assert(x->'version'='2'::jsonb AND jsonb_typeof(x->'reviews')='array' AND jsonb_array_length(x->'reviews')=2 AND x->'current_review'->>'method'='unknown' AND x->'current_review'->>'evidence_basis'='insufficient_evidence','Complete current payment review history is missing');
 PERFORM pg_temp.irp174_assert(x->'reviews'->0=current_setting('irp174.first_result')::jsonb->'review','First immutable review history changed');
 d:=(public.irp_pms_pilot_workspace(t,(h->>'property')::uuid)->>'business_date')::date;report:=pg_temp.irp174_report(t,(h->>'property')::uuid,d,d+1);
 PERFORM pg_temp.irp174_assert(report->>'actor_id'=current_setting('irp174.actor') AND report->'rows_truncated'='false'::jsonb AND report->'summary'->'complete'='true'::jsonb AND jsonb_typeof(report->'rows')='array' AND jsonb_array_length(report->'rows')=6 AND report->'summary'->'row_count'='6'::jsonb AND report->'summary'->'folio_row_count'='3'::jsonb AND report->'summary'->'security_deposit_row_count'='3'::jsonb,'Complete hotel report evidence is missing');
 PERFORM pg_temp.irp174_assert(report->'totals'->'guest_folio'->'received_minor'='10000'::jsonb AND report->'totals'->'guest_folio'->'refunded_minor'='2000'::jsonb AND report->'totals'->'guest_folio'->'reduced_minor'='1000'::jsonb AND report->'totals'->'guest_folio'->'external_record_effect_minor'='8000'::jsonb AND report->'totals'->'guest_folio'->'record_balance_effect_minor'='7000'::jsonb,'Folio recording-period equation is incomplete');
 PERFORM pg_temp.irp174_assert(report->'totals'->'refundable_security'->'received_minor'='5000'::jsonb AND report->'totals'->'refundable_security'->'refunded_minor'='1000'::jsonb AND report->'totals'->'refundable_security'->'reduced_minor'='500'::jsonb AND report->'totals'->'refundable_security'->'external_record_effect_minor'='4000'::jsonb AND report->'totals'->'refundable_security'->'record_balance_effect_minor'='3500'::jsonb,'Separate security-purpose equation is incomplete');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='folio' AND row->'record'->>'id'=h->>'payment' AND row->'record'->>'reservation_id'=h->>'reservation' AND row->'record'->>'kind'='external_payment' AND row->'record'->'amount_minor'='10000'::jsonb AND row->'effects'->'received_minor'='10000'::jsonb AND row->'effects'->'external_record_effect_minor'='10000'::jsonb AND row->'effects'->'record_balance_effect_minor'='10000'::jsonb),'Hotel source payment row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='folio' AND row->'record'->>'id'=h->>'refund' AND row->'record'->>'target_entry_id'=h->>'payment' AND row->'record'->>'kind'='external_refund' AND row->'record'->'amount_minor'='2000'::jsonb AND row->'effects'->'refunded_minor'='2000'::jsonb AND row->'effects'->'external_record_effect_minor'='-2000'::jsonb AND row->'effects'->'record_balance_effect_minor'='-2000'::jsonb),'Hotel source refund row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='folio' AND row->'record'->>'target_entry_id'=h->>'payment' AND row->'record'->>'kind'='payment_correction' AND row->'record'->'amount_minor'='1000'::jsonb AND row->'effects'->'reduced_minor'='1000'::jsonb AND row->'effects'->'external_record_effect_minor'='0'::jsonb AND row->'effects'->'record_balance_effect_minor'='-1000'::jsonb),'Hotel source correction row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='security_deposit' AND row->'record'->>'reservation_id'=h->>'reservation' AND row->'record'->>'kind'='external_receipt' AND row->'record'->'amount_minor'='5000'::jsonb AND row->'effects'->'external_record_effect_minor'='5000'::jsonb AND row->'effects'->'record_balance_effect_minor'='5000'::jsonb),'Hotel security receipt row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='security_deposit' AND row->'record'->>'kind'='external_refund' AND row->'record'->'amount_minor'='1000'::jsonb AND row->'effects'->'external_record_effect_minor'='-1000'::jsonb AND row->'effects'->'record_balance_effect_minor'='-1000'::jsonb),'Hotel security refund row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='security_deposit' AND row->'record'->>'kind'='receipt_reduction' AND row->'record'->'amount_minor'='500'::jsonb AND row->'effects'->'external_record_effect_minor'='0'::jsonb AND row->'effects'->'record_balance_effect_minor'='-500'::jsonb),'Hotel security reduction row evidence is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='folio' AND row->'record'->>'kind'='external_payment' AND row->'classification'->>'method'='unknown' AND row->'classification'->'review_version'='2'::jsonb),'Current reviewed-unknown classification is missing');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=1 FROM jsonb_array_elements(report->'rows') row WHERE row->>'ledger'='folio' AND row->'record'->>'kind'='external_refund' AND row->'classification'->>'method'='bank_transfer'),'Refund inherited its target method');
 PERFORM pg_temp.irp174_assert((SELECT count(*)=2 FROM jsonb_array_elements(report->'rows') row WHERE row->'classification'->>'state'='not_money_movement' AND row->'classification'->'method'='null'::jsonb AND row->'effects'->'external_record_effect_minor'='0'::jsonb),'Corrections/reductions were classified as money movement');
 PERFORM pg_temp.irp174_assert(position('PRIVATE HOTEL NAME' IN report::text)=0 AND position('PRIVATE HOTEL NAME' IN x::text)=0,'Guest identity leaked into metadata report');
 PERFORM pg_temp.irp174_assert((public.irp_pms_pilot_guest_documents(t,(h->>'property')::uuid,(h->>'reservation')::uuid)-'generated_at')=current_setting('irp174.document')::jsonb,'Existing173 guest document changed');
 d:=(public.irp_pms_pilot_workspace(t,(home->>'property')::uuid)->>'business_date')::date;report:=pg_temp.irp174_report(t,(home->>'property')::uuid,d,d+1);
 PERFORM pg_temp.irp174_assert(report->'property'->>'operating_model'='whole_home' AND report->'summary'->'row_count'='1'::jsonb AND report->'totals'->'guest_folio'->'received_minor'='1000'::jsonb AND report->'totals'->'refundable_security'->'record_count'='0'::jsonb,'Whole-home report inferred security or lost known payment evidence');
 PERFORM pg_temp.irp174_assert(jsonb_typeof(report->'rows')='array' AND jsonb_array_length(report->'rows')=1 AND report->'rows'->0->>'ledger'='folio' AND report->'rows'->0->'record'->>'id'=home->>'payment' AND report->'rows'->0->'record'->>'reservation_id'=home->>'reservation' AND report->'rows'->0->'record'->>'kind'='external_payment' AND report->'rows'->0->'record'->'amount_minor'='1000'::jsonb AND report->'rows'->0->'classification'->>'method'='other' AND report->'rows'->0->'classification'->>'method_detail'='TEST174 external voucher' AND report->'rows'->0->'classification'->>'evidence_basis'='operator_report_only' AND report->'rows'->0->'effects'->'external_record_effect_minor'='1000'::jsonb AND report->'rows'->0->'effects'->'record_balance_effect_minor'='1000'::jsonb,'Whole-home report row evidence is missing');
 PERFORM pg_temp.irp174_assert(public.irp_pms_pilot_payment_record_review_request_status(t,(h->>'property')::uuid,current_setting('irp174.first_request')::uuid)->'result'=current_setting('irp174.first_result')::jsonb,'Saved request lookup changed');
 PERFORM pg_temp.irp174_expect_rejection(format('SELECT pg_temp.irp174_detail(%L,%L,%L,%L)',t,h->>'property',home->>'reservation',h->>'payment'),'P0001');
END $reads$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.irp174_expect_rejection(format('SELECT public.irp_pms_pilot_payment_record_review(%L,%L,%L,%L)',current_setting('irp174.tenant'),current_setting('irp174.hotel')::jsonb->>'property',current_setting('irp174.hotel')::jsonb->>'reservation',current_setting('irp174.hotel')::jsonb->>'payment'),'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.irp174_expect_rejection(format('SELECT public.irp_pms_pilot_payment_record_review_request_status(%L,%L,%L)',current_setting('irp174.tenant'),current_setting('irp174.hotel')::jsonb->>'property',current_setting('irp174.first_request')),'42501');
RESET ROLE;
SELECT pg_temp.irp174_assert(pg_temp.irp174_state()=current_setting('irp174.read_baseline')::jsonb,'Pure metadata reads changed stored rows');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'payment_record_reviews_transaction_proof_passed' AS verification;
ROLLBACK;
