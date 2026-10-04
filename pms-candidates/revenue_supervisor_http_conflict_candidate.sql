-- Installed and qualified only on isolated branch ybehrayzwzyufxbxcysq. Not a live migration.
-- Deterministic stale revision conflicts must not use serialization_failure retry semantics.
BEGIN;
DO $check$ BEGIN IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'c4249df6f9d6a485d5805fb3ae347d91' THEN RAISE EXCEPTION 'Unexpected supervisor source'; END IF; END $check$;
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
 IF q.revision<>p_expected_revision THEN RAISE EXCEPTION 'This exception changed. Refresh before reviewing.' USING ERRCODE='PT409'; END IF;
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
COMMIT;
