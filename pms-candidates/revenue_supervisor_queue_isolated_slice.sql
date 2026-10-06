-- ISOLATED QUEUE SLICE ONLY: ybehrayzwzyufxbxcysq, parent eiqmdldjnedqgbtoozqa.
-- Catalog-only snapshot, 2026-10-05. No production rows or secrets copied.
-- Never add to automatic PMS/OTA migrations. Existing review/rate functions untouched.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF to_regprocedure('public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Existing isolated pricing slice required; live parent is forbidden'; END IF;
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'ae12f9df71b5335f86614494ff07dff8' OR md5(pg_get_functiondef('irp_pms.pilot_require(uuid,uuid,boolean)'::regprocedure))<>'7f62d01281c4f47257d179a95f34f632' THEN RAISE EXCEPTION 'Isolated authorization source mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision' AND (has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('authenticated',p.oid,'execute') OR has_function_privilege('service_role',p.oid,'execute'))) THEN RAISE EXCEPTION 'Rate apply must remain disabled'; END IF;
 IF to_regprocedure('public.irp_pms_pilot_revenue_supervisor_queue(integer,text,boolean)') IS NOT NULL OR to_regprocedure('irp_pms.observe_revenue_forecast_health(uuid,uuid,timestamptz)') IS NOT NULL OR to_regprocedure('irp_pms.observe_revenue_supervisor_issue(uuid,uuid,text,text,text,text,text,timestamptz)') IS NOT NULL THEN RAISE EXCEPTION 'Queue slice already exists; inspect rather than overwrite'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues) OR EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_events) THEN RAISE EXCEPTION 'Unfinished review fixtures require cleanup first'; END IF;
END $guard$;

CREATE TABLE irp_pms."gateway_connections" (
 "connection_id" text NOT NULL,
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "ota_property_id" text NOT NULL,
 "inventory_authority" text NOT NULL,
 "room_types" jsonb NOT NULL,
 "signing_secret" text NOT NULL,
 "enabled" boolean DEFAULT false NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "gateway_connections_connection_id_check" CHECK ((connection_id ~ '^[A-Za-z0-9_-]{1,80}$'::text)),
 CONSTRAINT "gateway_connections_inventory_authority_check" CHECK ((inventory_authority = ANY (ARRAY['existing-pms'::text, 'iratepilot-pms'::text]))),
 CONSTRAINT "gateway_connections_ota_property_id_check" CHECK (((length(TRIM(BOTH FROM ota_property_id)) >= 1) AND (length(TRIM(BOTH FROM ota_property_id)) <= 128))),
 CONSTRAINT "gateway_connections_pkey" PRIMARY KEY (connection_id),
 CONSTRAINT "gateway_connections_room_types_check" CHECK ((jsonb_typeof(room_types) = 'object'::text)),
 CONSTRAINT "gateway_connections_signing_secret_check" CHECK (((octet_length(signing_secret) >= 32) AND (octet_length(signing_secret) <= 512))),
 CONSTRAINT "gateway_connections_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id)
);
ALTER TABLE irp_pms."gateway_connections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms."gateway_connections" FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE irp_pms."revenue_forecast_records" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "room_type_id" uuid NOT NULL,
 "stay_date" date NOT NULL,
 "issued_at" timestamp with time zone NOT NULL,
 "stay_start_at" timestamp with time zone NOT NULL,
 "stay_end_at" timestamp with time zone NOT NULL,
 "source_captured_at" timestamp with time zone NOT NULL,
 "baseline_captured_at" timestamp with time zone,
 "model_version" text NOT NULL,
 "currency" text NOT NULL,
 "source_basis" text NOT NULL,
 "capacity" integer NOT NULL,
 "on_books_rooms" integer NOT NULL,
 "predicted_rooms" integer,
 "evidence_state" text NOT NULL,
 CONSTRAINT "revenue_forecast_records_capacity_check" CHECK ((capacity > 0)),
 CONSTRAINT "revenue_forecast_records_check" CHECK ((on_books_rooms <= capacity)),
 CONSTRAINT "revenue_forecast_records_check1" CHECK (((predicted_rooms >= 0) AND (predicted_rooms <= capacity))),
 CONSTRAINT "revenue_forecast_records_check2" CHECK ((((evidence_state = 'recorded'::text) AND (predicted_rooms IS NOT NULL)) OR ((evidence_state = 'insufficient_history'::text) AND (predicted_rooms IS NULL)))),
 CONSTRAINT "revenue_forecast_records_check3" CHECK (((source_captured_at <= issued_at) AND (issued_at < stay_start_at) AND (stay_start_at < stay_end_at))),
 CONSTRAINT "revenue_forecast_records_check4" CHECK (((baseline_captured_at IS NULL) OR (baseline_captured_at < source_captured_at))),
 CONSTRAINT "revenue_forecast_records_evidence_state_check" CHECK ((evidence_state = ANY (ARRAY['recorded'::text, 'insufficient_history'::text]))),
 CONSTRAINT "revenue_forecast_records_model_version_check" CHECK ((model_version = ANY (ARRAY['on-books-v1'::text, 'seven-day-pace-v1'::text]))),
 CONSTRAINT "revenue_forecast_records_on_books_rooms_check" CHECK ((on_books_rooms >= 0)),
 CONSTRAINT "revenue_forecast_records_pkey" PRIMARY KEY (tenant_id, property_id, room_type_id, stay_date, source_captured_at, model_version)
);
ALTER TABLE irp_pms."revenue_forecast_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms."revenue_forecast_records" FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE irp_pms."revenue_shadow_snapshots" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "room_type_id" uuid NOT NULL,
 "stay_date" date NOT NULL,
 "captured_at" timestamp with time zone NOT NULL,
 "currency" text NOT NULL,
 "basis" text DEFAULT 'booked-room-revenue-v1'::text NOT NULL,
 "booked_room_nights" integer NOT NULL,
 "sellable_room_nights" integer,
 "room_revenue_minor" bigint,
 CONSTRAINT "revenue_shadow_snapshots_basis_check" CHECK ((basis = 'booked-room-revenue-v1'::text)),
 CONSTRAINT "revenue_shadow_snapshots_booked_room_nights_check" CHECK ((booked_room_nights >= 0)),
 CONSTRAINT "revenue_shadow_snapshots_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)),
 CONSTRAINT "revenue_shadow_snapshots_pkey" PRIMARY KEY (tenant_id, property_id, room_type_id, stay_date, captured_at),
 CONSTRAINT "revenue_shadow_snapshots_room_revenue_minor_check" CHECK ((room_revenue_minor >= 0)),
 CONSTRAINT "revenue_shadow_snapshots_sellable_room_nights_check" CHECK ((sellable_room_nights >= 0))
);
CREATE INDEX revenue_shadow_lookup ON irp_pms.revenue_shadow_snapshots USING btree (tenant_id, property_id, stay_date, room_type_id, captured_at DESC);
CREATE INDEX revenue_shadow_capture_time ON irp_pms.revenue_shadow_snapshots USING btree (tenant_id, property_id, captured_at DESC);
ALTER TABLE irp_pms."revenue_shadow_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms."revenue_shadow_snapshots" FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION irp_pms.observe_revenue_supervisor_issue(p_tenant uuid, p_property uuid, p_key text, p_priority text, p_title text, p_detail text, p_fingerprint text, p_observed timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$
 INSERT INTO irp_pms.revenue_supervisor_issues(tenant_id,property_id,issue_key,priority,title,detail,fingerprint,first_seen_at,observed_at)
 VALUES(p_tenant,p_property,p_key,p_priority,p_title,p_detail,p_fingerprint,p_observed,p_observed)
 ON CONFLICT(tenant_id,property_id,issue_key) DO UPDATE SET
  priority=excluded.priority,title=excluded.title,detail=excluded.detail,fingerprint=excluded.fingerprint,active=true,observed_at=excluded.observed_at,
  revision=irp_pms.revenue_supervisor_issues.revision+CASE WHEN NOT irp_pms.revenue_supervisor_issues.active OR irp_pms.revenue_supervisor_issues.fingerprint<>excluded.fingerprint THEN 1 ELSE 0 END,
  review_status=CASE WHEN NOT irp_pms.revenue_supervisor_issues.active OR irp_pms.revenue_supervisor_issues.fingerprint<>excluded.fingerprint THEN 'open' ELSE irp_pms.revenue_supervisor_issues.review_status END,
  assigned_to=CASE WHEN NOT irp_pms.revenue_supervisor_issues.active THEN NULL ELSE irp_pms.revenue_supervisor_issues.assigned_to END,
  reviewed_at=CASE WHEN NOT irp_pms.revenue_supervisor_issues.active OR irp_pms.revenue_supervisor_issues.fingerprint<>excluded.fingerprint THEN NULL ELSE irp_pms.revenue_supervisor_issues.reviewed_at END;
$function$
;

CREATE OR REPLACE FUNCTION irp_pms.observe_revenue_forecast_health(p_tenant uuid, p_property uuid, p_observed timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_capture timestamptz;v_zone text;v_missing integer;v_pending integer;v_expected integer;v_fp text;
BEGIN
 IF p_tenant IS DISTINCT FROM 'faa76112-c793-43db-92bd-f9faecd8d93a'::uuid
 OR p_property IS DISTINCT FROM '7d9add80-216e-435c-86e9-58e17cdcbb6d'::uuid THEN RETURN; END IF;
 IF p_observed IS NULL THEN RAISE EXCEPTION 'Observation time required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||'/'||p_property::text,0));
 SELECT time_zone INTO v_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT max(captured_at) INTO v_capture FROM irp_pms.revenue_shadow_snapshots WHERE tenant_id=p_tenant AND property_id=p_property;
 IF v_capture IS NULL THEN
  PERFORM irp_pms.observe_revenue_supervisor_issue(p_tenant,p_property,'capture_missing','attention','PMS capture not enrolled','No persisted revenue capture exists. This property cannot use pickup or forecast actions.','missing',p_observed);
 ELSIF v_capture<p_observed-interval '7 hours' OR v_capture>p_observed THEN
  PERFORM irp_pms.observe_revenue_supervisor_issue(p_tenant,p_property,'capture_stale','critical','PMS capture is stale','Last persisted capture: '||v_capture::text||'. Revenue actions remain blocked.','stale',p_observed);
 ELSE
  WITH expected AS (
   SELECT s.room_type_id,s.stay_date,m.model FROM irp_pms.revenue_shadow_snapshots s
   CROSS JOIN (VALUES ('on-books-v1'),('seven-day-pace-v1')) m(model)
   WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND s.captured_at=v_capture
    AND s.stay_date>(p_observed AT TIME ZONE v_zone)::date AND s.stay_date<=(p_observed AT TIME ZONE v_zone)::date+30
    AND s.sellable_room_nights>0 AND s.booked_room_nights BETWEEN 0 AND s.sellable_room_nights
  ), checked AS (
   SELECT e.*,r.evidence_state,r.source_captured_at FROM expected e LEFT JOIN irp_pms.revenue_forecast_records r
    ON r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=e.room_type_id
    AND r.stay_date=e.stay_date AND r.model_version=e.model AND r.source_captured_at=v_capture
    AND r.issued_at<=p_observed
  ) SELECT count(*),count(*) FILTER(WHERE source_captured_at IS NULL),count(*) FILTER(WHERE evidence_state='insufficient_history'),
    md5(coalesce(jsonb_agg(jsonb_build_array(room_type_id,stay_date,model) ORDER BY room_type_id,stay_date,model) FILTER(WHERE source_captured_at IS NULL),'[]'::jsonb)::text)
   INTO v_expected,v_missing,v_pending,v_fp FROM checked;
  IF v_missing>0 THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(p_tenant,p_property,'forecast_recording_missing','critical','Forecast recording is incomplete',v_missing::text||' of '||v_expected::text||' expected forecasts are absent for the current PMS capture. Check the scheduled recorder; do not backdate predictions.',v_fp,p_observed);
  END IF;
  IF v_pending>0 THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(p_tenant,p_property,'forecast_pickup_pending','attention','Forecast pickup history is incomplete',v_pending::text||' pace records await a comparable seven-day pickup baseline. Missing predictions cannot be scored or used for live pricing.','seven_day_history_missing',p_observed);
  END IF;
 END IF;
 -- Resolve only conditions owned by this monitor; never retire another subsystem's issues.
 UPDATE irp_pms.revenue_supervisor_issues SET active=false,revision=revision+1
 WHERE tenant_id=p_tenant AND property_id=p_property AND active
  AND issue_key IN ('capture_missing','capture_stale','forecast_recording_missing','forecast_pickup_pending')
  AND observed_at<p_observed;
END $function$
;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_revenue_supervisor_queue(p_offset integer DEFAULT 0, p_status text DEFAULT 'all'::text, p_mine boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE prop record; v_now timestamptz:=clock_timestamp(); v_capture timestamptz; v_first timestamptz; v_enabled integer; v_missing integer; v_duplicate integer; v_oversold integer; v_count integer; v_items jsonb; v_total integer; v_critical integer; v_ack integer; v_mapping_fp text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>10000 OR p_status IS NULL OR p_status NOT IN('all','open','in_review','acknowledged') OR p_mine IS NULL THEN RAISE EXCEPTION 'Invalid queue filters'; END IF;
 SELECT count(*) INTO v_count FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id WHERE m.user_id=auth.uid() AND m.role IN('owner','manager');
 IF v_count>500 THEN RAISE EXCEPTION 'This queue supports up to 500 authorized properties'; END IF;
 FOR prop IN SELECT p.* FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id WHERE m.user_id=auth.uid() AND m.role IN('owner','manager') ORDER BY p.tenant_id,p.id LOOP
  PERFORM irp_pms.pilot_require(prop.tenant_id,prop.id,true);
  -- Serialize observations with reviews for this property without loading any guest records.
  PERFORM pg_advisory_xact_lock(hashtextextended(prop.tenant_id::text||'/'||prop.id::text,0));
  SELECT max(captured_at),min(captured_at) INTO v_capture,v_first FROM irp_pms.revenue_shadow_snapshots WHERE tenant_id=prop.tenant_id AND property_id=prop.id;
  IF v_capture IS NULL THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'capture_missing','attention','PMS capture not enrolled','No persisted revenue capture exists. This property cannot use pickup or forecast actions.','missing',v_now);
  ELSE
   IF v_capture<v_now-interval '7 hours' THEN
    PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'capture_stale','critical','PMS capture is stale','Last persisted capture: '||v_capture::text||'. Revenue actions remain blocked.','stale',v_now);
   END IF;
   IF v_first>v_now-interval '30 days' THEN
    PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'pickup_history','attention','Pickup history is accumulating','Complete 1/3/7/14/30-day baselines and validate the first forecast before live pricing.','accumulating',v_now);
   ELSE
    PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'forecast_validation','attention','Forecast validation pending','Snapshot age alone does not prove complete pickup windows or validated forecast accuracy.','unvalidated',v_now);
   END IF;
   SELECT count(*) INTO v_oversold FROM irp_pms.revenue_shadow_snapshots s WHERE s.tenant_id=prop.tenant_id AND s.property_id=prop.id AND s.captured_at=v_capture AND s.stay_date>=(v_now AT TIME ZONE prop.time_zone)::date AND s.stay_date<(v_now AT TIME ZONE prop.time_zone)::date+14 AND s.booked_room_nights>s.sellable_room_nights;
   IF v_oversold>0 THEN
    PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'oversold','critical','Captured inventory is oversold',v_oversold::text||' room-type nights exceed effective inventory in the latest capture. Review live PMS inventory.',v_oversold::text,v_now);
   END IF;
  END IF;
  SELECT md5(coalesce((SELECT jsonb_agg(jsonb_build_array(connection_id,enabled,ota_property_id,room_types) ORDER BY connection_id) FROM irp_pms.gateway_connections WHERE tenant_id=prop.tenant_id AND property_id=prop.id),'[]'::jsonb)::text || coalesce((SELECT jsonb_agg(id ORDER BY id) FROM irp_pms.room_types WHERE tenant_id=prop.tenant_id AND property_id=prop.id),'[]'::jsonb)::text) INTO v_mapping_fp;
  SELECT count(*) INTO v_enabled FROM irp_pms.gateway_connections WHERE tenant_id=prop.tenant_id AND property_id=prop.id AND enabled;
  SELECT count(*) INTO v_missing FROM irp_pms.room_types t WHERE t.tenant_id=prop.tenant_id AND t.property_id=prop.id AND NOT EXISTS(SELECT 1 FROM irp_pms.gateway_connections c CROSS JOIN LATERAL jsonb_each_text(c.room_types) x WHERE c.tenant_id=t.tenant_id AND c.property_id=t.property_id AND c.enabled AND x.value=t.id::text);
  IF v_missing>0 THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'room_mapping','attention','Room mapping incomplete',v_missing::text||' PMS room types have no enabled destination mapping.',v_missing::text||v_mapping_fp,v_now);
  END IF;
  SELECT count(*) INTO v_duplicate FROM (SELECT c.ota_property_id,x.key FROM irp_pms.gateway_connections c CROSS JOIN LATERAL jsonb_each_text(c.room_types) x WHERE c.tenant_id=prop.tenant_id AND c.property_id=prop.id AND c.enabled GROUP BY c.ota_property_id,x.key HAVING count(*)>1) duplicated;
  IF v_duplicate>0 THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'duplicate_gateway','critical','Duplicate enabled gateway routes',v_duplicate::text||' destination room IDs appear in multiple enabled connections. Review Connections before live distribution.',v_duplicate::text||v_mapping_fp,v_now);
  END IF;
  IF v_enabled>0 THEN
   PERFORM irp_pms.observe_revenue_supervisor_issue(prop.tenant_id,prop.id,'rate_mapping','attention','Destination rate mapping unverified','The destination has no verified rate-plan contract. Review and certify mapping before enabling writeback.','unverified',v_now);
  END IF;
  PERFORM irp_pms.observe_revenue_forecast_health(prop.tenant_id,prop.id,v_now);
  UPDATE irp_pms.revenue_supervisor_issues SET active=false,revision=revision+1 WHERE tenant_id=prop.tenant_id AND property_id=prop.id AND active AND observed_at<v_now;
 END LOOP;
 SELECT count(*),count(*) FILTER(WHERE q.priority='critical'),count(*) FILTER(WHERE q.review_status='acknowledged') INTO v_total,v_critical,v_ack
 FROM irp_pms.revenue_supervisor_issues q JOIN irp_pms.memberships m ON m.tenant_id=q.tenant_id AND m.user_id=auth.uid() AND m.role IN('owner','manager')
 WHERE q.active AND (p_status='all' OR q.review_status=p_status) AND (NOT p_mine OR q.assigned_to=auth.uid());
 SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY rank,first_seen_at,id),'[]'::jsonb) INTO v_items FROM (
  SELECT q.id,q.tenant_id,q.property_id,p.name property_name,q.issue_key,q.priority,q.title,q.detail,q.review_status,q.revision,q.first_seen_at,q.observed_at,q.reviewed_at,
   q.assigned_to=auth.uid() assigned_to_me,q.assigned_to IS NOT NULL assigned,
   (q.assigned_to IS NOT NULL AND q.assigned_to<>auth.uid() AND NOT EXISTS(
    SELECT 1 FROM irp_pms.memberships former WHERE former.tenant_id=q.tenant_id AND former.user_id=q.assigned_to AND former.role IN('owner','manager')
   )) reclaimable,CASE WHEN q.priority='critical' THEN 0 ELSE 1 END rank
  FROM irp_pms.revenue_supervisor_issues q JOIN irp_pms.memberships m ON m.tenant_id=q.tenant_id AND m.user_id=auth.uid() AND m.role IN('owner','manager') JOIN irp_pms.properties p ON p.tenant_id=q.tenant_id AND p.id=q.property_id
  WHERE q.active AND (p_status='all' OR q.review_status=p_status) AND (NOT p_mine OR q.assigned_to=auth.uid())
  ORDER BY rank,q.first_seen_at,q.id LIMIT 50 OFFSET p_offset
 ) rows;
 RETURN jsonb_build_object('as_of',v_now,'property_count',v_count,'total',v_total,'critical',v_critical,'acknowledged',v_ack,'offset',p_offset,'items',v_items,'next_offset',CASE WHEN p_offset+50<v_total THEN p_offset+50 ELSE NULL END);
END $function$
;

REVOKE ALL ON FUNCTION irp_pms.observe_revenue_supervisor_issue(uuid,uuid,text,text,text,text,text,timestamptz),irp_pms.observe_revenue_forecast_health(uuid,uuid,timestamptz),public.irp_pms_pilot_revenue_supervisor_queue(integer,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_revenue_supervisor_queue(integer,text,boolean) TO authenticated;
DO $verify$
BEGIN
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_queue(integer,text,boolean)'::regprocedure))<>'c4ae842e83094387889917f2600050c0' THEN RAISE EXCEPTION 'Installed irp_pms_pilot_revenue_supervisor_queue source mismatch'; END IF;
 IF md5(pg_get_functiondef('irp_pms.observe_revenue_supervisor_issue(uuid,uuid,text,text,text,text,text,timestamptz)'::regprocedure))<>'7792d1b13cd5c7bcfdd9d210e28a2f5a' THEN RAISE EXCEPTION 'Installed observe_revenue_supervisor_issue source mismatch'; END IF;
 IF md5(pg_get_functiondef('irp_pms.observe_revenue_forecast_health(uuid,uuid,timestamptz)'::regprocedure))<>'1d5fa05f0d3181d7d850b8f13428dca2' THEN RAISE EXCEPTION 'Installed observe_revenue_forecast_health source mismatch'; END IF;
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'ae12f9df71b5335f86614494ff07dff8' THEN RAISE EXCEPTION 'Review source changed unexpectedly'; END IF;
END $verify$;
NOTIFY pgrst,'reload schema';
COMMIT;
