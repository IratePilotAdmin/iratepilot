-- ISOLATED ONLY: requires the synthetic 19-table pricing fixture, never a live PMS.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r')<>19
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification')
 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
CREATE SCHEMA revenue_qualification;
CREATE TABLE revenue_qualification.control(phase text PRIMARY KEY,finished boolean NOT NULL DEFAULT false,worker_pid integer,completed_at timestamptz);
CREATE TABLE revenue_qualification.observations(phase text PRIMARY KEY,holder_pid integer NOT NULL,waiter_pid integer NOT NULL,wait_event text,blockers integer[] NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO revenue_qualification.control(phase) VALUES('capacity'),('membership'),('demotion_before_save');
CREATE FUNCTION revenue_qualification.observe_audit_overlap() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE phase text:=current_setting('revenue_qualification.phase',true); marker integer; waiter record;
BEGIN
 IF phase NOT IN('capacity','membership') OR phase IS NULL THEN RETURN NEW;END IF;
 marker:=CASE phase WHEN 'capacity' THEN 1 ELSE 2 END;
 PERFORM pg_advisory_xact_lock(987654,marker);
 FOR attempt IN 1..200 LOOP
  PERFORM pg_stat_clear_snapshot();
  SELECT a.pid,a.wait_event,pg_blocking_pids(a.pid) blockers INTO waiter FROM pg_stat_activity a
  WHERE a.application_name='revenue_qualification_'||phase AND a.wait_event_type='Lock'
  AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid));
  IF FOUND THEN
   INSERT INTO revenue_qualification.observations(phase,holder_pid,waiter_pid,wait_event,blockers)
   VALUES(phase,pg_backend_pid(),waiter.pid,waiter.wait_event,waiter.blockers);
   RETURN NEW;
  END IF;
  PERFORM pg_sleep(0.1);
 END LOOP;
 RAISE EXCEPTION 'No overlapping worker lock wait captured for %',phase;
END $$;
CREATE TRIGGER qualification_overlap BEFORE INSERT ON irp_pms.revenue_rate_decisions
FOR EACH ROW EXECUTE FUNCTION revenue_qualification.observe_audit_overlap();
CREATE FUNCTION revenue_qualification.run_worker(phase text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE done boolean; marker integer; holder integer; waiter record;
BEGIN
 IF phase NOT IN('capacity','membership','demotion_before_save') THEN RAISE EXCEPTION 'Unknown qualification phase';END IF;
 SELECT finished INTO STRICT done FROM revenue_qualification.control c WHERE c.phase=run_worker.phase FOR UPDATE;
 IF done THEN RETURN;END IF;
 PERFORM set_config('application_name','revenue_qualification_'||phase,true);
 IF phase='demotion_before_save' THEN
  PERFORM 1 FROM irp_pms.properties WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND id='00000000-0000-4000-8000-000000000002' FOR UPDATE;
  UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND user_id='00000000-0000-4000-8000-000000000005';
  PERFORM pg_advisory_xact_lock(987654,3);
  FOR attempt IN 1..300 LOOP
   PERFORM pg_stat_clear_snapshot();
   SELECT a.pid,a.wait_event,pg_blocking_pids(a.pid) blockers INTO waiter FROM pg_stat_activity a
   WHERE a.application_name='revenue_qualification_approval_waiter' AND a.wait_event_type='Lock' AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid));
   IF FOUND THEN
    INSERT INTO revenue_qualification.observations(phase,holder_pid,waiter_pid,wait_event,blockers)
    VALUES(phase,pg_backend_pid(),waiter.pid,waiter.wait_event,waiter.blockers);
    UPDATE revenue_qualification.control c SET finished=true,worker_pid=pg_backend_pid(),completed_at=clock_timestamp() WHERE c.phase=run_worker.phase;
    RETURN;
   END IF;
   PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE EXCEPTION 'No approval waiting on demotion worker was captured';
 END IF;
 marker:=CASE phase WHEN 'capacity' THEN 1 ELSE 2 END;
 FOR attempt IN 1..150 LOOP
  SELECT pid INTO holder FROM pg_locks WHERE locktype='advisory' AND classid=987654 AND objid=marker AND granted AND pid<>pg_backend_pid() LIMIT 1;
  EXIT WHEN FOUND;
  PERFORM pg_sleep(0.1);
 END LOOP;
 IF holder IS NULL THEN RETURN;END IF;
 IF phase='capacity' THEN
  UPDATE irp_pms.nightly_capacity SET units=9 WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND property_id='00000000-0000-4000-8000-000000000002' AND room_type_id='00000000-0000-4000-8000-000000000003' AND stay_date='2026-10-01';
 ELSE
  UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND user_id='00000000-0000-4000-8000-000000000005';
 END IF;
 UPDATE revenue_qualification.control c SET finished=true,worker_pid=pg_backend_pid(),completed_at=clock_timestamp() WHERE c.phase=run_worker.phase;
END $$;
REVOKE ALL ON SCHEMA revenue_qualification FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA revenue_qualification FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA revenue_qualification FROM PUBLIC,anon,authenticated,service_role;

