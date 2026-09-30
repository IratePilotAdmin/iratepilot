-- Administrator-only qualification. All fixture and queue-observation writes roll back.
DO $$ DECLARE t uuid:=gen_random_uuid();p uuid:=gen_random_uuid();i uuid:=gen_random_uuid();u uuid;former uuid;req uuid:=gen_random_uuid();r jsonb;page jsonb;report text;
BEGIN BEGIN
 SELECT user_id INTO STRICT u FROM irp_pms.memberships WHERE tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND role='owner' LIMIT 1;
 SELECT id INTO STRICT former FROM auth.users WHERE id<>u ORDER BY id LIMIT 1;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Temporary abandoned review qualification');
 INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES(t,p,'Temporary review property','USD');
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,u,'owner'),(t,former,'manager');
 INSERT INTO irp_pms.revenue_supervisor_issues(id,tenant_id,property_id,issue_key,priority,title,detail,fingerprint,assigned_to,review_status,first_seen_at,observed_at)
 VALUES(i,t,p,'capture_missing','attention','Test','Test','missing',former,'in_review',clock_timestamp(),clock_timestamp());
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req);RAISE EXCEPTION 'Active takeover accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Another supervisor owns this review' THEN RAISE; END IF;END;
 UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=t AND user_id=former;
 page:=public.irp_pms_pilot_revenue_supervisor_queue();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(page->'items') x WHERE x->>'id'=i::text AND (x->>'reclaimable')::boolean) THEN RAISE EXCEPTION 'Abandoned queue hint missing';END IF;
 UPDATE irp_pms.revenue_supervisor_issues SET revision=1 WHERE id=i;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'release',gen_random_uuid());RAISE EXCEPTION 'Unclaimed release accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Another supervisor owns this review' THEN RAISE; END IF;END;
 r:=public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req);
 IF r->>'reclaimed'<>'true' OR r->>'previous_assignee'<>former::text OR (r->>'revision')::int<>2 THEN RAISE EXCEPTION 'Recovery receipt incorrect';END IF;
 r:=public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req);
 IF r->>'replayed'<>'true' OR r->>'reclaimed'<>'true' THEN RAISE EXCEPTION 'Replay incorrect';END IF;
 UPDATE irp_pms.revenue_supervisor_issues SET assigned_to=former,revision=3 WHERE id=i;
 UPDATE irp_pms.memberships SET role='manager' WHERE tenant_id=t AND user_id=former;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,3,'claim',gen_random_uuid());RAISE EXCEPTION 'Restored active takeover accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Another supervisor owns this review' THEN RAISE; END IF;END;
 DELETE FROM irp_pms.memberships WHERE tenant_id=t AND user_id=former;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,2,'claim',gen_random_uuid());RAISE EXCEPTION 'Stale recovery accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 r:=public.irp_pms_pilot_revenue_supervisor_review(t,p,i,3,'claim',gen_random_uuid());
 IF r->>'reclaimed'<>'true' OR (r->>'revision')::int<>4 THEN RAISE EXCEPTION 'Removed membership recovery failed';END IF;
 IF (SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE issue_id=i AND action='claim')<>2 THEN RAISE EXCEPTION 'Wrong audit count';END IF;
 UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=t AND user_id=u;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,4,'release',gen_random_uuid());RAISE EXCEPTION 'Staff review accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RAISE SQLSTATE 'ZX001' USING DETAIL='{"active_takeover":"denied","abandoned_hint":"passed","demoted_recovery":"passed","receipt_replay":"passed","restored_supervisor":"protected","stale_recovery":"denied","removed_recovery":"passed","audit_count":2,"staff_action":"denied"}';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN GET STACKED DIAGNOSTICS report=PG_EXCEPTION_DETAIL;END;
 PERFORM set_config('irp_test.recovery_result',report,true);
END $$;
SELECT current_setting('irp_test.recovery_result')::jsonb AS result;