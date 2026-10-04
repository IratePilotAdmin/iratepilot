-- PMS DATABASE ONLY. All fixtures and review operations roll back in a subtransaction.
-- Requires a current private-pilot owner membership. Creates no users and sends no requests.
DO $test$
DECLARE v_user uuid;v_fixture uuid:=gen_random_uuid();v_existing integer;v_now timestamptz:=clock_timestamp();
 v_start timestamptz;v_first_ms numeric;v_next_ms numeric;v_last_ms numeric;v_empty_ms numeric;
 q1 jsonb;q2 jsonb;q_last jsonb;q_empty jsonb;v_total integer;v_last_offset integer;v_rejected boolean:=false;
 item jsonb;receipt jsonb;replay jsonb;v_request uuid:=gen_random_uuid();v_report text;
BEGIN
 BEGIN
  SELECT user_id INTO v_user FROM irp_pms.memberships WHERE tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND role='owner' LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Private pilot owner required'; END IF;
  SELECT count(*) INTO v_existing FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id WHERE m.user_id=v_user AND m.role IN ('owner','manager');
  IF v_existing>=500 THEN RAISE EXCEPTION 'Fixture run requires fewer than 500 preexisting authorized properties'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  INSERT INTO irp_pms.tenants(id,name) VALUES(v_fixture,'Temporary revenue supervisor qualification');
  INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(v_fixture,v_user,'owner');
  INSERT INTO irp_pms.properties(tenant_id,name,currency)
   SELECT v_fixture,'Temporary queue property '||n,'USD' FROM generate_series(1,500-v_existing) n;
  INSERT INTO irp_pms.room_types(tenant_id,property_id,name)
   SELECT v_fixture,p.id,r.name FROM irp_pms.properties p CROSS JOIN (VALUES ('Test King'),('Test Queen')) r(name) WHERE p.tenant_id=v_fixture;
  INSERT INTO irp_pms.gateway_connections(connection_id,tenant_id,property_id,ota_property_id,inventory_authority,room_types,signing_secret,enabled)
   SELECT 'qualification-'||p.id::text||'-'||route.n,v_fixture,p.id,'test-destination-'||p.id::text,'iratepilot-pms',
    jsonb_build_object('test-room',(SELECT min(id::text) FROM irp_pms.room_types WHERE tenant_id=v_fixture AND property_id=p.id)),
    repeat('temporary-unusable-test-key-',2),true
   FROM irp_pms.properties p CROSS JOIN (VALUES (1),(2)) route(n) WHERE p.tenant_id=v_fixture;
  WITH numbered AS (SELECT *,row_number() OVER(ORDER BY property_id,id) n FROM irp_pms.room_types WHERE tenant_id=v_fixture)
  INSERT INTO irp_pms.revenue_shadow_snapshots(tenant_id,property_id,room_type_id,stay_date,captured_at,currency,booked_room_nights,sellable_room_nights)
   SELECT v_fixture,r.property_id,r.id,(v_now AT TIME ZONE 'America/Chicago')::date,
    CASE WHEN capture.old THEN v_now-interval '31 days' WHEN r.n%4<2 THEN v_now-interval '8 hours' ELSE v_now END,
    'USD',11,10 FROM numbered r CROSS JOIN (VALUES (true),(false)) capture(old);
  v_start:=clock_timestamp();q1:=public.irp_pms_pilot_revenue_supervisor_queue(0,'all',false);v_first_ms:=extract(epoch FROM clock_timestamp()-v_start)*1000;
  IF (q1->>'property_count')::integer<>500 OR jsonb_array_length(q1->'items')<>50 THEN RAISE EXCEPTION '500-property first-page contract failed';END IF;
  v_total:=(q1->>'total')::integer;v_last_offset:=((v_total-1)/50)*50;
  v_start:=clock_timestamp();q2:=public.irp_pms_pilot_revenue_supervisor_queue(50,'all',false);v_next_ms:=extract(epoch FROM clock_timestamp()-v_start)*1000;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(q1->'items') a JOIN jsonb_array_elements(q2->'items') b ON a->>'id'=b->>'id') THEN RAISE EXCEPTION 'First two pages overlap';END IF;
  IF (q2->>'total')::integer<>v_total OR jsonb_array_length(q2->'items')<>50 OR (q1->>'next_offset')::integer<>50 THEN RAISE EXCEPTION 'Second-page totals or cursor changed';END IF;
  v_start:=clock_timestamp();q_last:=public.irp_pms_pilot_revenue_supervisor_queue(v_last_offset,'all',false);v_last_ms:=extract(epoch FROM clock_timestamp()-v_start)*1000;
  IF jsonb_array_length(q_last->'items')<>v_total-v_last_offset OR q_last->'next_offset'<>'null'::jsonb THEN RAISE EXCEPTION 'Last-page contract failed';END IF;
  v_start:=clock_timestamp();q_empty:=public.irp_pms_pilot_revenue_supervisor_queue(v_total,'all',false);v_empty_ms:=extract(epoch FROM clock_timestamp()-v_start)*1000;
  IF jsonb_array_length(q_empty->'items')<>0 OR (q_empty->>'total')::integer<>v_total THEN RAISE EXCEPTION 'Past-end page contract failed';END IF;
  SELECT x INTO item FROM jsonb_array_elements(q1->'items') x WHERE x->>'tenant_id'=v_fixture::text LIMIT 1;
  IF item IS NULL THEN RAISE EXCEPTION 'Expected a fixture exception on the first page';END IF;
  receipt:=public.irp_pms_pilot_revenue_supervisor_review(v_fixture,(item->>'property_id')::uuid,(item->>'id')::uuid,(item->>'revision')::bigint,'claim',v_request);
  replay:=public.irp_pms_pilot_revenue_supervisor_review(v_fixture,(item->>'property_id')::uuid,(item->>'id')::uuid,(item->>'revision')::bigint,'claim',v_request);
  IF replay->>'replayed'<>'true' OR receipt->'revision'<>replay->'revision' THEN RAISE EXCEPTION 'Claim replay failed';END IF;
  BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(v_fixture,(item->>'property_id')::uuid,(item->>'id')::uuid,(item->>'revision')::bigint,'acknowledge',gen_random_uuid());
   RAISE EXCEPTION 'Stale review revision was accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
  INSERT INTO irp_pms.properties(tenant_id,name,currency) VALUES(v_fixture,'Temporary property beyond limit','USD');
  BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_queue(0,'all',false);
   EXCEPTION WHEN raise_exception THEN IF SQLERRM='This queue supports up to 500 authorized properties' THEN v_rejected:=true;ELSE RAISE;END IF;END;
  IF NOT v_rejected THEN RAISE EXCEPTION '501-property guard failed';END IF;
  v_report:=jsonb_build_object('state','passed','authorized_properties',500,'existing_properties',v_existing,'fixture_properties',500-v_existing,
   'active_exceptions',v_total,'first_page_items',50,'first_page_bytes',octet_length(q1::text),'last_page_items',jsonb_array_length(q_last->'items'),
   'server_execution_ms',jsonb_build_object('initial',round(v_first_ms,3),'next',round(v_next_ms,3),'last',round(v_last_ms,3),'past_end',round(v_empty_ms,3)),
   'pagination','first/next/last/past-end passed; first two pages disjoint','claim_replay','passed','stale_revision','rejected','property_501','rejected',
   'limits','Single-session synthetic database check, not concurrent HTTP/browser or autonomous 500-hotel certification','fixtures_rolled_back',true)::text;
  RAISE SQLSTATE 'ZX001' USING MESSAGE='Rollback qualification fixtures',DETAIL=v_report;
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN GET STACKED DIAGNOSTICS v_report=PG_EXCEPTION_DETAIL;
 END;
 IF EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id=v_fixture) THEN RAISE EXCEPTION 'Fixture cleanup failed';END IF;
 PERFORM set_config('irp_test.supervisor_500_report',v_report,true);
END $test$;
SELECT current_setting('irp_test.supervisor_500_report')::jsonb AS qualification;
