CREATE OR REPLACE FUNCTION public.irp_pms_pilot_revenue_supervisor_review(p_tenant uuid, p_property uuid, p_issue uuid, p_expected_revision bigint, p_action text, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE q irp_pms.revenue_supervisor_issues; prior irp_pms.revenue_supervisor_events; result jsonb; member_role text; assigned_role text; previous_assignee uuid; reclaimed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_action IS NULL OR p_action NOT IN('claim','release','acknowledge','reopen') THEN RAISE EXCEPTION 'Invalid review command'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||'/'||p_property::text,0));
 -- Re-check access after waiting, and hold the authorization rows through commit.
 SELECT m.role INTO member_role
 FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.user_id=auth.uid() AND p.id=p_property
 FOR SHARE OF m,p;
 IF member_role IS NULL OR member_role NOT IN('owner','manager') THEN
  RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prior FROM irp_pms.revenue_supervisor_events WHERE request_id=p_request;
 IF FOUND THEN
  IF prior.tenant_id<>p_tenant OR prior.property_id<>p_property OR prior.issue_id<>p_issue OR prior.actor_id<>auth.uid() OR prior.action<>p_action OR prior.expected_revision<>p_expected_revision THEN RAISE EXCEPTION 'Review request does not match the original'; END IF;
  RETURN prior.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO q FROM irp_pms.revenue_supervisor_issues WHERE id=p_issue AND tenant_id=p_tenant AND property_id=p_property FOR UPDATE;
 IF NOT FOUND OR NOT q.active THEN RAISE EXCEPTION 'This exception is no longer active. Refresh the queue.'; END IF;
 IF q.revision<>p_expected_revision THEN RAISE EXCEPTION 'This exception changed. Refresh before reviewing.' USING ERRCODE='40001'; END IF;
 previous_assignee:=q.assigned_to;
 IF q.assigned_to IS NOT NULL AND q.assigned_to<>auth.uid() THEN
  SELECT role INTO assigned_role FROM irp_pms.memberships
   WHERE tenant_id=p_tenant AND user_id=q.assigned_to FOR SHARE;
  IF p_action<>'claim' OR assigned_role IN('owner','manager') THEN
   RAISE EXCEPTION 'Another supervisor owns this review';
  END IF;
  reclaimed:=true;
 END IF;
 IF p_action='acknowledge' AND q.assigned_to IS NULL THEN RAISE EXCEPTION 'Claim this exception before acknowledging it'; END IF;
 UPDATE irp_pms.revenue_supervisor_issues SET
  assigned_to=CASE WHEN p_action='release' THEN NULL WHEN p_action='claim' THEN auth.uid() ELSE assigned_to END,
  review_status=CASE WHEN p_action='claim' THEN 'in_review' WHEN p_action='acknowledge' THEN 'acknowledged' ELSE 'open' END,
  reviewed_at=clock_timestamp(),revision=revision+1 WHERE id=q.id RETURNING * INTO q;
 result:=jsonb_build_object('request_id',p_request,'issue_id',q.id,'revision',q.revision,'review_status',q.review_status,'replayed',false,'reclaimed',reclaimed,'previous_assignee',CASE WHEN reclaimed THEN previous_assignee ELSE NULL END);
 INSERT INTO irp_pms.revenue_supervisor_events(request_id,issue_id,tenant_id,property_id,actor_id,action,expected_revision,receipt) VALUES(p_request,q.id,p_tenant,p_property,auth.uid(),p_action,p_expected_revision,result);
 RETURN result;
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
