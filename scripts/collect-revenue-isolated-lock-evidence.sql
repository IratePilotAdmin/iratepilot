-- ISOLATED ONLY: collect this single result before branch deletion.
-- Retain failed/unfinished runs; never infer success from observations alone.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r')<>19
 OR (SELECT count(*) FROM irp_pms.properties)<>1
 OR NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='00000000-0000-4000-8000-000000000001' AND name='Synthetic isolated lock qualification')
 THEN RAISE EXCEPTION 'Refuse non-isolated qualification environment'; END IF;
END $$;
SELECT jsonb_build_object(
 'collected_at',clock_timestamp(),
 'runs',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY runid),'[]'::jsonb) FROM
  (SELECT jobid,runid,job_pid,status,return_message,start_time,end_time FROM cron.job_run_details) r),
 'control',(SELECT jsonb_agg(to_jsonb(c) ORDER BY phase) FROM revenue_qualification.control c),
 'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY phase) FROM revenue_qualification.observations o),
 'remaining_jobs',(SELECT count(*) FROM cron.job),
 'unfinished_runs',(SELECT count(*) FROM cron.job_run_details WHERE end_time IS NULL),
 'failed_runs',(SELECT count(*) FROM cron.job_run_details WHERE status='failed'),
 'active_workers',(SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'revenue_qualification_%'),
 'decisions',(SELECT count(*) FROM irp_pms.revenue_rate_decisions),
 'actions',(SELECT count(*) FROM irp_pms.rate_actions),
 'rates',(SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT amount_minor,stay_date FROM irp_pms.nightly_rates) r),
 'plans',(SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT version FROM irp_pms.rate_plans) p),
 'roles',(SELECT jsonb_agg(role) FROM irp_pms.memberships)
) evidence;
