-- ISOLATED ONLY: synthetic pricing slice; never install on a live PMS.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r')<>19
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification')
 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
CREATE SCHEMA receipt_qualification;
CREATE TABLE receipt_qualification.control(phase text PRIMARY KEY,finished boolean NOT NULL DEFAULT false,worker_pid integer,result jsonb,completed_at timestamptz);
CREATE TABLE receipt_qualification.observations(phase text PRIMARY KEY,holder_pid integer NOT NULL,waiter_pid integer NOT NULL,wait_event text,blockers integer[] NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO receipt_qualification.control(phase) VALUES('duplicate'),('conflict');
CREATE FUNCTION receipt_qualification.observe_overlap() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE phase text:=current_setting('receipt_qualification.phase',true); marker integer; waiter record;
BEGIN
 IF phase IS NULL OR phase NOT IN('duplicate','conflict') THEN RETURN NEW; END IF;
 marker:=CASE phase WHEN 'duplicate' THEN 1 ELSE 2 END;
 PERFORM pg_advisory_xact_lock(987655,marker);
 FOR attempt IN 1..200 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT a.pid,a.wait_event,pg_blocking_pids(a.pid) blockers INTO waiter FROM pg_stat_activity a
  WHERE a.application_name='receipt_qualification_'||phase AND a.wait_event_type='Lock' AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid));
  IF FOUND THEN
   INSERT INTO receipt_qualification.observations(phase,holder_pid,waiter_pid,wait_event,blockers) VALUES(phase,pg_backend_pid(),waiter.pid,waiter.wait_event,waiter.blockers);
   RETURN NEW;
  END IF;
  PERFORM pg_sleep(0.1);
 END LOOP;
 RAISE EXCEPTION 'No overlapping receipt worker captured for %',phase;
END $$;
CREATE TRIGGER receipt_overlap BEFORE INSERT ON irp_pms.revenue_rate_decisions FOR EACH ROW EXECUTE FUNCTION receipt_qualification.observe_overlap();
CREATE FUNCTION receipt_qualification.run_worker(phase text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE done boolean; marker integer; holder integer; receipt jsonb;
BEGIN
 IF phase NOT IN('duplicate','conflict') OR phase IS NULL THEN RAISE EXCEPTION 'Unknown phase'; END IF;
 SELECT finished INTO STRICT done FROM receipt_qualification.control c WHERE c.phase=run_worker.phase FOR UPDATE;
 IF done THEN RETURN; END IF;
 PERFORM set_config('application_name','receipt_qualification_'||phase,true);
 marker:=CASE phase WHEN 'duplicate' THEN 1 ELSE 2 END;
 FOR attempt IN 1..150 LOOP
  SELECT pid INTO holder FROM pg_locks WHERE locktype='advisory' AND classid=987655 AND objid=marker AND granted AND pid<>pg_backend_pid() LIMIT 1;
  EXIT WHEN FOUND;
  PERFORM pg_sleep(0.1);
 END LOOP;
 IF holder IS NULL THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
 IF phase='duplicate' THEN
  receipt:=public.irp_pms_pilot_apply_revenue_decision('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004',1,'2026-10-01',14000,16100,7000,21000,NULL,0,10,8,800,1500,'none','["Reviewed inputs"]'::jsonb);
  IF receipt->>'replayed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Duplicate did not replay'; END IF;
 ELSE
  BEGIN
   receipt:=public.irp_pms_pilot_apply_revenue_decision('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000004',2,'2026-10-01',16100,18515,7000,21000,NULL,0,10,8,800,1500,'none','["Different reviewed inputs"]'::jsonb);
   RAISE EXCEPTION 'Conflicting request unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
   receipt:=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM);
  END;
 END IF;
 UPDATE receipt_qualification.control c SET finished=true,worker_pid=pg_backend_pid(),result=receipt,completed_at=clock_timestamp() WHERE c.phase=run_worker.phase;
END $$;
REVOKE ALL ON SCHEMA receipt_qualification FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA receipt_qualification FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA receipt_qualification FROM PUBLIC,anon,authenticated,service_role;
