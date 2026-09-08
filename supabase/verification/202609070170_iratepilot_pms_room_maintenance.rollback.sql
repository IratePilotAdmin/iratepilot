-- Transaction-only deployment proof. Uses an existing confirmed identity in
-- a new synthetic organization; no existing membership or hotel is changed.
-- SQL receiver calls below are synthetic, not external OTA delivery.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp170_expect_rejection(p_sql text,p_code text,p_message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE p_sql;RAISE EXCEPTION 'Expected rejection did not occur';
 EXCEPTION WHEN OTHERS THEN
  IF (p_code IS NOT NULL AND SQLSTATE<>p_code) OR (p_message IS NOT NULL AND strpos(SQLERRM,p_message)=0) THEN RAISE;END IF;
  IF p_code IS NULL AND p_message IS NULL THEN RAISE EXCEPTION 'Rejection assertion requires a code or message';END IF;
 END;
END $$;
DO $setup$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test organization owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only170 maintenance');
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp170.actor',actor::text,true);PERFORM set_config('irp170.tenant',t::text,true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $home$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;home jsonb;p uuid;rt uuid;room uuid;w jsonb;version bigint;d date;plan jsonb;quote jsonb;batch jsonb;preview jsonb;base jsonb;created jsonb;again jsonb;report jsonb;x jsonb;
 create_request uuid:=gen_random_uuid();booking_request uuid:=gen_random_uuid();quote_request uuid:=gen_random_uuid();
BEGIN
 home:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary170 home','UTC','whole_home',4);p:=(home->>'property_id')::uuid;rt:=(home->>'room_type_id')::uuid;room:=(home->>'room_id')::uuid;
 w:=public.irp_pms_pilot_workspace(t,p);d:=(w->>'business_date')::date;version:=(w->'rooms'->0->>'state_version')::bigint;
 PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+15,1);
 plan:=public.irp_pms_pilot_save_rate_plan(t,p,gen_random_uuid(),NULL,NULL,rt,'Synthetic170 plan',0,true);
 PERFORM public.irp_pms_pilot_set_nightly_rate(t,p,gen_random_uuid(),(plan->>'id')::uuid,(plan->>'version')::bigint,d,d+15,10000);
 quote:=public.irp_pms_pilot_quote_rate(t,p,gen_random_uuid(),(plan->>'id')::uuid,d+5,d+7,1);
 batch:=public.irp_pms_pilot_stage_import(t,p,gen_random_uuid(),'synthetic170',jsonb_build_array(jsonb_build_object('source_id','BEFORE170','guest_name','Synthetic170 staged','room_type_id',rt,'arrival',d+5,'departure',d+7,'guests',1,'currency','USD','accommodation_minor',20000,'taxes_minor',0)));
 IF (batch->>'error_count')::integer<>0 THEN RAISE EXCEPTION 'Initial migration preview failed';END IF;
 base:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic170 amendment base',d+8,d+9,1,10000,0);
 created:=public.irp_pms_pilot_create_room_closure(t,p,room,create_request,version,d,d+5,d+7,'Synthetic170 reviewed maintenance');
 again:=public.irp_pms_pilot_create_room_closure(t,p,room,create_request,version,d,d+5,d+7,'Synthetic170 reviewed maintenance');
 IF again IS DISTINCT FROM created||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Create exact receipt changed';END IF;
 report:=public.irp_pms_pilot_maintenance(t,p,d+5,d+7);
 IF (report->'inventory'->0->>'configured_units')::integer<>1 OR (report->'inventory'->0->>'closed_units')::integer<>1 OR (report->'inventory'->0->>'effective_units')::integer<>0 OR (created->>'room_state_version')::bigint<>version+1 THEN RAISE EXCEPTION 'Whole-home closure did not preserve ceiling and close effective availability';END IF;
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_create_room_closure(%L,%L,%L,%L,%L,%L,%L,%L,%L)',t,p,room,gen_random_uuid(),version,d-1,d+10,d+11,'Stale170 review'),'PT409',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_release_room_closure(%L,%L,%L,%L,%L,%L,%L)',t,p,created->'closure'->>'id',gen_random_uuid(),version+1,d-1,'Old170 business date'),'PT412',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_release_room_closure(%L,%L,%L,%L,%L,%L,%L)',t,p,created->'closure'->>'id',create_request,version+1,d,'Wrong170 shared request'),NULL,'request identity already used');
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_create_reservation(%L,%L,%L,%L,%L,%L,%L,1,20000,0)',t,p,booking_request,rt,'Synthetic170 blocked direct',d+5,d+7),NULL,'No availability');
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_book_quote(%L,%L,%L,%L,%L)',t,p,quote->>'id',quote_request,'Synthetic170 blocked quote'),NULL,'No availability');
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_amend_reservation(%L,%L,%L,%L,1,%L,%L,%L,%L,1,20000,0)',t,p,base->>'id',gen_random_uuid(),'Synthetic170 blocked amendment',rt,d+5,d+7),NULL,'No availability');
 preview:=public.irp_pms_pilot_stage_import(t,p,gen_random_uuid(),'synthetic170',jsonb_build_array(jsonb_build_object('source_id','AFTER170','guest_name','Synthetic170 blocked import','room_type_id',rt,'arrival',d+5,'departure',d+7,'guests',1,'currency','USD','accommodation_minor',20000,'taxes_minor',0)));
 IF (preview->>'error_count')::integer<>1 THEN RAISE EXCEPTION 'Import preview bypassed maintenance';END IF;
 x:=public.irp_pms_pilot_commit_import(t,p,(batch->>'batch_id')::uuid,gen_random_uuid());IF x->>'status'<>'validation_failed' THEN RAISE EXCEPTION 'Import commit bypassed maintenance';END IF;
 PERFORM set_config('irp170.home',jsonb_build_object('property',p,'type',rt,'room',room,'business_date',d,'original_room_version',version,'create_request',create_request,'created',created,'booking_request',booking_request,'quote',quote,'quote_request',quote_request)::text,true);
END $home$;
-- Exercise the installed SQL receiver under its existing service role. This
-- synthetic event is confined to the temporary organization and rolled back.
SET LOCAL ROLE service_role;
DO $receiver$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;h jsonb:=current_setting('irp170.home')::jsonb;p uuid:=(h->>'property')::uuid;rt uuid:=(h->>'type')::uuid;d date:=(h->>'business_date')::date;event text:='SYNTHETIC170-'||gen_random_uuid()::text;booking text:='SYNTHETIC170-'||gen_random_uuid()::text;x jsonb;
BEGIN
 x:=irp_pms.receive_reservation(t,p,event,booking,1,repeat('a',64),jsonb_build_object('source_booking_id',booking,'source_version',1,'payload_hash',repeat('a',64),'status','Confirmed','room_type_id',rt,'arrival',d+5,'departure',d+7,'guests',1,'accommodation_minor',20000,'taxes_minor',0,'ota_fees_minor',0,'guest_total_minor',20000));
 IF x->>'applicationOutcome'<>'review:sold_out' THEN RAISE EXCEPTION 'Synthetic SQL receiver bypassed maintenance';END IF;
 PERFORM set_config('irp170.event',event,true);
END $receiver$;
DO $service_authority$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;h jsonb:=current_setting('irp170.home')::jsonb;p uuid:=(h->>'property')::uuid;rt uuid:=(h->>'type')::uuid;d date:=(h->>'business_date')::date;
BEGIN
 -- Eight old public entrypoints retain their observed Supabase service-role
 -- EXECUTE grant. That grant alone must not satisfy a hotel member check.
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_workspace(%L,%L)',t,p),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_configure_property(%L,%L,''Unauthorized170'',''UTC'')',t,p),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_set_capacity(%L,%L,%L,%L,%L,1)',t,p,rt,d,d+1),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_create_reservation(%L,%L,%L,%L,''Unauthorized170'',%L,%L,1,10000,0)',t,p,gen_random_uuid(),rt,d+10,d+11),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_amend_reservation(%L,%L,%L,%L,1,''Unauthorized170'',%L,%L,%L,1,10000,0)',t,p,gen_random_uuid(),gen_random_uuid(),rt,d+10,d+11),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_stage_import(%L,%L,%L,''synthetic170'',''[]''::jsonb)',t,p,gen_random_uuid()),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_commit_import(%L,%L,%L,%L)',t,p,gen_random_uuid(),gen_random_uuid()),'42501',NULL);
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_stay_action(%L,%L,%L,''check_in'',%L)',t,p,gen_random_uuid(),h->>'room'),'42501',NULL);
 PERFORM set_config('request.jwt.claim.sub',current_setting('irp170.actor'),true);
END $service_authority$;
SET LOCAL ROLE authenticated;
DO $hotel_and_release$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;h jsonb:=current_setting('irp170.home')::jsonb;hp uuid:=(h->>'property')::uuid;d date:=(h->>'business_date')::date;property jsonb;p uuid;rt uuid;r1 jsonb;r2 jsonb;stay jsonb;c1 jsonb;c2 jsonb;w jsonb;x jsonb;released jsonb;release_request uuid:=gen_random_uuid();current_version bigint;booked jsonb;
BEGIN
 x:=public.irp_pms_pilot_reprocess(t,hp,current_setting('irp170.event'),gen_random_uuid(),'SYNTHETIC170-REPROCESS');IF x->>'applicationOutcome'<>'review:sold_out' THEN RAISE EXCEPTION 'Manager reprocessing bypassed maintenance';END IF;
 property:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary170 hotel','UTC','hotel',NULL);p:=(property->>'property_id')::uuid;
 x:=public.irp_pms_pilot_save_room_type(t,p,NULL,'Synthetic170 type',2);rt:=(x->>'id')::uuid;
 r1:=public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP170-101');r2:=public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP170-102');
 PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+10,2);
 r1:=public.irp_pms_pilot_set_housekeeping(t,p,(r1->>'id')::uuid,gen_random_uuid(),(r1->>'state_version')::bigint,'Clean')->'room';
 r2:=public.irp_pms_pilot_set_housekeeping(t,p,(r2->>'id')::uuid,gen_random_uuid(),(r2->>'state_version')::bigint,'Clean')->'room';
 stay:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic170 physical stay',d,d+2,1,20000,0);
 c2:=public.irp_pms_pilot_create_room_closure(t,p,(r2->>'id')::uuid,gen_random_uuid(),(r2->>'state_version')::bigint,d,d+1,d+3,'Synthetic170 later physical repair');
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_stay_action(%L,%L,%L,''check_in'',%L)',t,p,stay->>'id',r2->>'id'),NULL,'maintenance closure');
 stay:=public.irp_pms_pilot_stay_action(t,p,(stay->>'id')::uuid,'check_in',(r1->>'id')::uuid);
 w:=public.irp_pms_pilot_workspace(t,p);SELECT (value->>'state_version')::bigint INTO current_version FROM jsonb_array_elements(w->'rooms') WHERE value->>'id'=r1->>'id';
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_move_room(%L,%L,%L,%L,1,%L,%L,%L,%L,%L)',t,p,stay->>'id',gen_random_uuid(),r1->>'id',current_version,r2->>'id',c2->>'room_state_version','Synthetic170 blocked move'),NULL,'maintenance closure');
 c1:=public.irp_pms_pilot_create_room_closure(t,p,(r1->>'id')::uuid,gen_random_uuid(),current_version,d,d+2,d+4,'Synthetic170 future extension conflict');
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_extend_stay(%L,%L,%L,%L,1,%L,30000,0,%L)',t,p,stay->>'id',gen_random_uuid(),d+3,'Synthetic170 blocked extension'),NULL,'maintenance closure');
 PERFORM public.irp_pms_pilot_release_room_closure(t,p,(c1->'closure'->>'id')::uuid,gen_random_uuid(),(c1->>'room_state_version')::bigint,d,'Synthetic170 resolved repair one');
 PERFORM public.irp_pms_pilot_release_room_closure(t,p,(c2->'closure'->>'id')::uuid,gen_random_uuid(),(c2->>'room_state_version')::bigint,d,'Synthetic170 resolved repair two');
 x:=public.irp_pms_pilot_extend_stay(t,p,(stay->>'id')::uuid,gen_random_uuid(),1,d+3,30000,0,'Synthetic170 released extension');IF (x->'reservation'->>'source_version')::bigint<>2 THEN RAISE EXCEPTION 'Extension did not resume after explicit release';END IF;
 released:=public.irp_pms_pilot_release_room_closure(t,hp,(h->'created'->'closure'->>'id')::uuid,release_request,(h->'created'->>'room_state_version')::bigint,d,'Synthetic170 home repair resolved');
 x:=public.irp_pms_pilot_release_room_closure(t,hp,(h->'created'->'closure'->>'id')::uuid,release_request,(h->'created'->>'room_state_version')::bigint,d,'Synthetic170 home repair resolved');
 IF x IS DISTINCT FROM released||jsonb_build_object('replayed',true) OR (released->'closure'->>'effective_end')::date<>d+5 OR (released->'closure'->>'scheduled_end')::date<>d+7 THEN RAISE EXCEPTION 'Release history or exact receipt mismatch';END IF;
 booked:=public.irp_pms_pilot_book_quote(t,hp,(h->'quote'->>'id')::uuid,(h->>'quote_request')::uuid,'Synthetic170 blocked quote');IF booked->'reservation'->>'status'<>'Confirmed' THEN RAISE EXCEPTION 'Quote did not book after release';END IF;
 x:=public.irp_pms_pilot_book_quote(t,hp,(h->'quote'->>'id')::uuid,(h->>'quote_request')::uuid,'Synthetic170 blocked quote');IF x IS DISTINCT FROM booked||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Booked quote receipt changed';END IF;
 w:=public.irp_pms_pilot_workspace(t,hp);IF w->'rooms'->0->>'housekeeping'<>'Dirty' OR jsonb_array_length(w->'rooms'->0->'maintenance_intervals')<>0 THEN RAISE EXCEPTION 'Release changed housekeeping or retained a zero interval';END IF;
 x:=public.irp_pms_pilot_operational_report(t,hp,d+5,d+7);IF (x->'summary'->>'configured_unit_nights')::integer<>2 OR (x->'summary'->>'capacity_unit_nights')::integer<>2 OR (x->'summary'->>'closed_unit_nights')::integer<>0 THEN RAISE EXCEPTION 'Effective report totals do not reconcile after release';END IF;
 PERFORM set_config('irp170.release_request',release_request::text,true);
END $hotel_and_release$;
RESET ROLE;
UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=current_setting('irp170.tenant')::uuid AND user_id=auth.uid();
SET LOCAL ROLE authenticated;
DO $downgrade$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;h jsonb:=current_setting('irp170.home')::jsonb;p uuid:=(h->>'property')::uuid;x jsonb;
BEGIN
 x:=public.irp_pms_pilot_maintenance_request_status(t,p,(h->>'create_request')::uuid);IF x->>'found'<>'true' THEN RAISE EXCEPTION 'Downgraded staff cannot inspect original receipt';END IF;
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_create_room_closure(%L,%L,%L,%L,%L,%L,%L,%L,%L)',t,p,h->>'room',h->>'create_request',h->>'original_room_version',h->>'business_date',(h->>'business_date')::date+5,(h->>'business_date')::date+7,'Synthetic170 reviewed maintenance'),'42501',NULL);
END $downgrade$;
RESET ROLE;
DELETE FROM irp_pms.memberships WHERE tenant_id=current_setting('irp170.tenant')::uuid AND user_id=auth.uid();
SET LOCAL ROLE authenticated;
DO $revoked$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;h jsonb:=current_setting('irp170.home')::jsonb;
BEGIN
 PERFORM pg_temp.irp170_expect_rejection(format('SELECT public.irp_pms_pilot_maintenance_request_status(%L,%L,%L)',t,h->>'property',h->>'create_request'),'42501',NULL);
END $revoked$;
RESET ROLE;
DO $invariants$
DECLARE t uuid:=current_setting('irp170.tenant')::uuid;
BEGIN
 IF (SELECT count(*) FROM irp_pms.room_closures WHERE tenant_id=t)<>3 OR (SELECT count(*) FROM irp_pms.maintenance_requests WHERE tenant_id=t)<>6 OR EXISTS(SELECT 1 FROM irp_pms.room_closures WHERE tenant_id=t AND (released_at IS NULL OR effective_end<>scheduled_start))
 OR (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=t)<>3 OR (SELECT count(*) FROM irp_pms.quote_bookings WHERE tenant_id=t)<>1 OR EXISTS(SELECT 1 FROM irp_pms.import_commits WHERE tenant_id=t)
 OR EXISTS(SELECT 1 FROM irp_pms.folio_openings WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM irp_pms.service_day_entries WHERE tenant_id=t)
 THEN RAISE EXCEPTION 'Unexpected fixture, duplicate receipt, imported reservation or financial write';END IF;
END $invariants$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'room_maintenance_transaction_proof_passed' AS verification;
ROLLBACK;
