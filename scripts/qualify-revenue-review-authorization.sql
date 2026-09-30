-- Run as database administrator on the PMS database. All fixture writes roll back.
DO $$ DECLARE t uuid:=gen_random_uuid();p uuid:=gen_random_uuid();i uuid:=gen_random_uuid();u uuid;r jsonb;req uuid:=gen_random_uuid();report text; BEGIN BEGIN
 SELECT user_id INTO STRICT u FROM irp_pms.memberships WHERE role='owner' ORDER BY tenant_id LIMIT 1;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Temporary review authorization qualification');
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,u,'owner');
 INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES(t,p,'Temporary authorization qualification','USD');
 INSERT INTO irp_pms.revenue_supervisor_issues(id,tenant_id,property_id,issue_key,priority,title,detail,fingerprint,first_seen_at,observed_at)
 VALUES(i,t,p,'auth-qualification','attention','Authorization qualification','Temporary test','auth-test',clock_timestamp(),clock_timestamp());
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 r:=public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req);
 IF (r->>'revision')::int<>2 THEN RAISE EXCEPTION 'claim failed'; END IF;
 r:=public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req);
 IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'replay failed'; END IF;
 UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=t AND user_id=u;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,1,'claim',req); RAISE EXCEPTION 'demoted replay accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM irp_pms.memberships WHERE tenant_id=t AND user_id=u;
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,2,'release',gen_random_uuid()); RAISE EXCEPTION 'removed member accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.irp_pms_pilot_revenue_supervisor_review(t,p,i,2,'release',gen_random_uuid()); RAISE EXCEPTION 'missing identity accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE SQLSTATE 'ZX001' USING DETAIL='{"claim":"passed","replay":"passed","demoted_replay":"denied","removed_member":"denied","missing_identity":"denied"}';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN GET STACKED DIAGNOSTICS report=PG_EXCEPTION_DETAIL; END;
 PERFORM set_config('irp_test.auth_result',report,true);
 END $$; SELECT current_setting('irp_test.auth_result')::jsonb AS result;