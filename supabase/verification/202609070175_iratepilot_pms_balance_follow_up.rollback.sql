-- DRAFT transaction-only175 proof. New fictional hotel/home fixtures only.
-- Reuses a confirmed test owner; no guest message, processor or network call.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp175_assert(p_condition boolean,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%',p_message;END IF;END $$;
CREATE FUNCTION pg_temp.irp175_reject(p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN
 IF p_code IS NULL OR p_code !~ '^[A-Z0-9]{5}$' OR p_code IN('57014','55P03','40P01','57P01','57P02','57P03') THEN RAISE EXCEPTION 'Expected validation SQLSTATE required';END IF;
 BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN IF SQLSTATE IS DISTINCT FROM p_code THEN RAISE;END IF;caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'Expected rejection did not occur' USING ERRCODE='P0004';END IF;
END $$;
DO $helpers$
DECLARE caught boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.irp175_reject('SELECT 1','P0001');EXCEPTION WHEN SQLSTATE 'P0004' THEN caught:=true;END;
 PERFORM pg_temp.irp175_assert(caught,'Rejection helper accepted successful SQL');
 PERFORM pg_temp.irp175_reject('DO $e$ BEGIN RAISE EXCEPTION ''Intended'' USING ERRCODE=''P0001'';END $e$','P0001');
 caught:=false;BEGIN PERFORM pg_temp.irp175_reject('DO $e$ BEGIN RAISE EXCEPTION ''Wrong'' USING ERRCODE=''42501'';END $e$','P0001');EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;PERFORM pg_temp.irp175_assert(caught,'Wrong SQLSTATE accepted');
 caught:=false;BEGIN PERFORM pg_temp.irp175_assert(NULL,'Intended null rejection');EXCEPTION WHEN SQLSTATE 'P0001' THEN caught:=true;END;PERFORM pg_temp.irp175_assert(caught,'NULL evidence accepted');
END $helpers$;
SELECT 'balance_follow_up_helper_self_test_passed' AS verification;
CREATE FUNCTION pg_temp.irp175_state(p_skip text[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:='{}';r record;value text;
BEGIN
 IF(SELECT count(*) FROM pg_tables WHERE schemaname='irp_pms') IS DISTINCT FROM 59::bigint THEN RAISE EXCEPTION 'Require all59 PMS tables';END IF;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' AND NOT(tablename=ANY(p_skip)) ORDER BY tablename LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(x)::text,''|'' ORDER BY to_jsonb(x)::text),'''')) FROM irp_pms.%I x',r.tablename) INTO value;
  result:=result||jsonb_build_object(r.tablename,value);
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION pg_temp.irp175_detail(t uuid,p uuid,r uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_balance_follow_up(t,p,r);
END $$;
CREATE FUNCTION pg_temp.irp175_queue(t uuid,p uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 RETURN public.irp_pms_pilot_balance_follow_up_queue(t,p,'{"state":"all","schedule":"all"}'::jsonb);
END $$;
CREATE FUNCTION pg_temp.irp175_command(d jsonb,a text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('reservation_id',d->'reservation_id','action',a,'expected_version',d->'version','expected_context_fingerprint',d->'current_context'->'context_fingerprint','expected_business_date',d->'property_business_date','expected_time_zone',d->'property'->'time_zone','follow_up_on',CASE WHEN a IN('schedule','reschedule','reopen') THEN d->'property_business_date' ELSE 'null'::jsonb END,'reason','TEST175 reviewed internal staff scheduling','confirmed',true)
$$;
DO $owner$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only175 balance follow-up');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp175.actor',actor::text,true);PERFORM set_config('irp175.tenant',t::text,true);
END $owner$;
SET LOCAL ROLE authenticated;
DO $fixtures$
DECLARE t uuid:=current_setting('irp175.tenant')::uuid;prop jsonb;home jsonb;r jsonb;hr jsonb;p uuid;rt uuid;d date;
BEGIN
 prop:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary175 hotel','America/Chicago','hotel',NULL);p:=(prop->>'property_id')::uuid;
 rt:=(public.irp_pms_pilot_save_room_type(t,p,NULL,'Temporary175 unit',2)->>'id')::uuid;PERFORM public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP175');
 d:=(public.irp_pms_pilot_workspace(t,p)->>'business_date')::date;PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+3,1);
 r:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'TEST175 PRIVATE HOTEL NAME',d,d+2,1,10000,1000);
 PERFORM public.irp_pms_pilot_post_folio(t,p,(r->>'id')::uuid,gen_random_uuid(),'external_payment',3000,'TEST175 fictional payment','TEST175 original private evidence',NULL);
 home:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary175 home','UTC','whole_home',4);d:=(public.irp_pms_pilot_workspace(t,(home->>'property_id')::uuid)->>'business_date')::date;
 PERFORM public.irp_pms_pilot_set_capacity(t,(home->>'property_id')::uuid,(home->>'room_type_id')::uuid,d,d+3,1);
 hr:=public.irp_pms_pilot_create_reservation(t,(home->>'property_id')::uuid,gen_random_uuid(),(home->>'room_type_id')::uuid,'TEST175 PRIVATE HOME NAME',d,d+2,1,0,0);
 PERFORM set_config('irp175.hotel',jsonb_build_object('property',p,'reservation',r->>'id')::text,true);PERFORM set_config('irp175.home',jsonb_build_object('property',home->>'property_id','reservation',hr->>'id')::text,true);
 PERFORM set_config('irp175.document',(public.irp_pms_pilot_guest_documents(t,p,(r->>'id')::uuid)-'generated_at')::text,true);
END $fixtures$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('irp175.old_state',pg_temp.irp175_state(ARRAY['activity','balance_follow_up_heads','balance_follow_up_events','balance_follow_up_requests'])::text,true) IS NOT NULL AS baseline_saved;
SELECT set_config('irp175.activity_count',(SELECT count(*)::text FROM irp_pms.activity WHERE tenant_id=current_setting('irp175.tenant')::uuid),true) IS NOT NULL AS activity_saved;
CREATE TEMP TABLE irp175_old_activity(id bigint PRIMARY KEY,fingerprint text NOT NULL) ON COMMIT DROP;
INSERT INTO irp175_old_activity SELECT id,md5(to_jsonb(a)::text) FROM irp_pms.activity a;
SELECT set_config('irp175.no_effects','{"financial_changed":false,"folio_changed":false,"security_deposit_changed":false,"revenue_changed":false,"taxes_changed":false,"money_moved":false,"reservation_changed":false,"guest_message_sent":false}',true) IS NOT NULL AS exact_effects_saved;
SET LOCAL ROLE authenticated;
DO $actions$
DECLARE t uuid:=current_setting('irp175.tenant')::uuid;h jsonb:=current_setting('irp175.hotel')::jsonb;home jsonb:=current_setting('irp175.home')::jsonb;pair jsonb;d jsonb;c jsonb;x jsonb;first jsonb;first_command jsonb;request uuid;first_request uuid;retired jsonb;a text;v integer;expected integer;actions text[];
BEGIN
 FOREACH pair IN ARRAY ARRAY[h,home] LOOP
  d:=pg_temp.irp175_detail(t,(pair->>'property')::uuid,(pair->>'reservation')::uuid);
  PERFORM pg_temp.irp175_assert(d->'recorded'='false'::jsonb AND d->'version'='0'::jsonb AND d->'head'='null'::jsonb AND d->'events'='[]'::jsonb AND d->>'actor_id'=current_setting('irp175.actor'),'Initial follow-up detail is incomplete');
  PERFORM pg_temp.irp175_assert(d->'current_context'->'totals'->'balance_minor'=CASE WHEN pair=h THEN '8000'::jsonb ELSE '0'::jsonb END AND d->'current_context'->>'opening_mode'=CASE WHEN pair=h THEN 'frozen' ELSE 'reservation_preview' END,'Initial financial context is incomplete');
  IF pair=home THEN
   c:=pg_temp.irp175_command(d,'schedule');request:=gen_random_uuid();retired:=public.irp_pms_pilot_retire_balance_follow_up_request(t,(pair->>'property')::uuid,request,c,'TEST175 retire uncertain local command');
   PERFORM pg_temp.irp175_assert(retired->>'outcome'='retired' AND retired->'follow_up_version_changed'='false'::jsonb AND retired->'command'=c AND retired->'financial_effects'=current_setting('irp175.no_effects')::jsonb AND NOT(retired?|ARRAY['event','version','head']),'Retirement receipt is incomplete');
   PERFORM pg_temp.irp175_assert(public.irp_pms_pilot_save_balance_follow_up(t,(pair->>'property')::uuid,request,c)=retired||'{"replayed":true}'::jsonb,'Retirement failed to fence delayed save');
  END IF;
  actions:=CASE WHEN pair=h THEN ARRAY['schedule','reschedule','complete','reopen','stop'] ELSE ARRAY['schedule','complete','reopen'] END;v:=0;first:=NULL;
  FOREACH a IN ARRAY actions LOOP
   d:=pg_temp.irp175_detail(t,(pair->>'property')::uuid,(pair->>'reservation')::uuid);c:=pg_temp.irp175_command(d,a);request:=gen_random_uuid();
   x:=public.irp_pms_pilot_save_balance_follow_up(t,(pair->>'property')::uuid,request,c);v:=v+1;
   PERFORM pg_temp.irp175_assert(x->>'outcome'='recorded' AND x->'version'=to_jsonb(v) AND x->'command'=c AND x->'event'->'context'=d->'current_context' AND x->'event'->>'actor_id'=current_setting('irp175.actor') AND x->'financial_effects'=current_setting('irp175.no_effects')::jsonb,'Accepted follow-up receipt is incomplete');
   IF first IS NULL THEN first:=x;first_request:=request;first_command:=c;END IF;
   PERFORM pg_temp.irp175_assert(public.irp_pms_pilot_save_balance_follow_up(t,(pair->>'property')::uuid,request,c)=x||'{"replayed":true}'::jsonb,'Exact save replay changed');
  END LOOP;
  PERFORM pg_temp.irp175_assert(public.irp_pms_pilot_save_balance_follow_up(t,(pair->>'property')::uuid,first_request,first_command)=first||'{"replayed":true}'::jsonb,'Historical replay changed');
  PERFORM pg_temp.irp175_assert(public.irp_pms_pilot_balance_follow_up_request_status(t,(pair->>'property')::uuid,first_request)->'result'=first,'Original actor receipt lookup failed');
  d:=pg_temp.irp175_detail(t,(pair->>'property')::uuid,(pair->>'reservation')::uuid);expected:=CASE WHEN pair=h THEN 5 ELSE 3 END;
  PERFORM pg_temp.irp175_assert(d->'version'=to_jsonb(expected) AND jsonb_typeof(d->'events')='array' AND jsonb_array_length(d->'events')=expected AND d->'events'->0=first->'event' AND d->'events_truncated'='false'::jsonb AND d->'head'->>'state'=CASE WHEN pair=h THEN 'stopped' ELSE 'open' END,'Complete retained history is missing');
  PERFORM pg_temp.irp175_reject(format('SELECT public.irp_pms_pilot_save_balance_follow_up(%L,%L,%L,%L::jsonb)',t,pair->>'property',gen_random_uuid(),first_command),'PT409');
  c:=pg_temp.irp175_command(d,CASE WHEN pair=h THEN 'reopen' ELSE 'reschedule' END);
  PERFORM pg_temp.irp175_reject(format('SELECT public.irp_pms_pilot_save_balance_follow_up(%L,%L,%L,%L::jsonb)',t,pair->>'property',gen_random_uuid(),c||jsonb_build_object('expected_context_fingerprint',repeat('0',64))),'PT409');
  PERFORM pg_temp.irp175_reject(format('SELECT public.irp_pms_pilot_save_balance_follow_up(%L,%L,%L,%L::jsonb)',t,pair->>'property',gen_random_uuid(),c||'{"expected_business_date":"2000-01-01"}'::jsonb),'PT412');
  IF pair=h THEN PERFORM set_config('irp175.first_result',first::text,true);END IF;
 END LOOP;
END $actions$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.irp175_assert(pg_temp.irp175_state(ARRAY['activity','balance_follow_up_heads','balance_follow_up_events','balance_follow_up_requests'])=current_setting('irp175.old_state')::jsonb,'Follow-up metadata changed old financial/configuration/source rows');
DO $counts$
DECLARE t uuid:=current_setting('irp175.tenant')::uuid;
BEGIN
 PERFORM pg_temp.irp175_assert((SELECT count(*)=2 FROM irp_pms.balance_follow_up_heads WHERE tenant_id=t),'Expected2 follow-up heads');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=8 FROM irp_pms.balance_follow_up_events WHERE tenant_id=t),'Expected8 immutable events');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=9 FROM irp_pms.balance_follow_up_requests WHERE tenant_id=t),'Expected9 exact request outcomes');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=current_setting('irp175.activity_count')::bigint+9 FROM irp_pms.activity WHERE tenant_id=t),'Expected9 new metadata audits');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=8 FROM irp_pms.activity WHERE tenant_id=t AND action='balance_follow_up_recorded'),'Expected8 save audits');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=1 FROM irp_pms.activity WHERE tenant_id=t AND action='balance_follow_up_request_retired'),'Expected1 retirement audit');
 PERFORM pg_temp.irp175_assert(NOT EXISTS(SELECT 1 FROM irp175_old_activity old LEFT JOIN irp_pms.activity a ON a.id=old.id WHERE a.id IS NULL OR md5(to_jsonb(a)::text) IS DISTINCT FROM old.fingerprint),'A preexisting activity row changed');
 PERFORM pg_temp.irp175_assert((SELECT count(*)=9 FROM irp_pms.activity a WHERE NOT EXISTS(SELECT 1 FROM irp175_old_activity old WHERE old.id=a.id)),'Unexpected new activity outside the exact9 outcomes');
 PERFORM pg_temp.irp175_assert(NOT EXISTS(SELECT 1 FROM irp_pms.balance_follow_up_events e WHERE e.tenant_id=t AND NOT EXISTS(SELECT 1 FROM irp_pms.activity a WHERE a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.target_id=e.reservation_id AND a.actor_id=e.actor_id AND a.created_at=e.recorded_at AND a.action='balance_follow_up_recorded' AND a.details=jsonb_build_object('request_id',e.request_id,'event_id',e.id,'follow_up_action',e.action,'from_version',e.from_version,'to_version',e.to_version))),'Recorded event audit does not pair exactly');
 PERFORM pg_temp.irp175_assert(NOT EXISTS(SELECT 1 FROM irp_pms.balance_follow_up_requests r WHERE r.tenant_id=t AND r.outcome='retired' AND NOT EXISTS(SELECT 1 FROM irp_pms.activity a WHERE a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.target_id=r.reservation_id AND a.actor_id=r.actor_id AND a.created_at=r.recorded_at AND a.action='balance_follow_up_request_retired' AND a.details=jsonb_build_object('request_id',r.request_id,'follow_up_action',r.command->>'action','expected_version',(r.command->>'expected_version')::bigint))),'Retired request audit does not pair exactly');
END $counts$;
SELECT set_config('irp175.read_state',pg_temp.irp175_state()::text,true) IS NOT NULL AS read_baseline_saved;
SET LOCAL ROLE authenticated;
DO $reads$
DECLARE t uuid:=current_setting('irp175.tenant')::uuid;h jsonb:=current_setting('irp175.hotel')::jsonb;home jsonb:=current_setting('irp175.home')::jsonb;q jsonb;
BEGIN
 q:=pg_temp.irp175_queue(t,(h->>'property')::uuid);
 PERFORM pg_temp.irp175_assert(jsonb_typeof(q->'rows')='array' AND jsonb_array_length(q->'rows')=1 AND q->'summary'->'row_count'='1'::jsonb AND q->'summary'->'known_balance_minor'='8000'::jsonb AND q->'rows'->0->'reservation'->>'id'=h->>'reservation' AND q->'rows'->0->'head'->'version'='5'::jsonb AND q->'rows'->0->'head'->>'state'='stopped' AND q->'complete'='true'::jsonb AND q->'rows_truncated'='false'::jsonb,'Complete hotel queue evidence is missing');
 q:=pg_temp.irp175_queue(t,(home->>'property')::uuid);
 PERFORM pg_temp.irp175_assert(jsonb_typeof(q->'rows')='array' AND jsonb_array_length(q->'rows')=1 AND q->'summary'->'row_count'='1'::jsonb AND q->'summary'->'known_balance_minor'='0'::jsonb AND q->'summary'->'zero_balance_count'='1'::jsonb AND q->'rows'->0->'reservation'->>'id'=home->>'reservation' AND q->'rows'->0->'head'->'version'='3'::jsonb AND q->'rows'->0->'head'->>'state'='open' AND q->'complete'='true'::jsonb,'Complete home queue evidence is missing');
 PERFORM pg_temp.irp175_assert((public.irp_pms_pilot_guest_documents(t,(h->>'property')::uuid,(h->>'reservation')::uuid)-'generated_at')=current_setting('irp175.document')::jsonb,'Existing guest document changed');
 PERFORM pg_temp.irp175_assert(NOT(q::text LIKE '%PRIVATE HOME NAME%') AND NOT(q::text LIKE '%original private evidence%'),'Staff queue leaked excluded source details');
END $reads$;
RESET ROLE;
SELECT pg_temp.irp175_assert(pg_temp.irp175_state()=current_setting('irp175.read_state')::jsonb,'Read APIs changed persisted rows');
SELECT 'balance_follow_up_transaction_proof_passed' AS verification;
ROLLBACK;
